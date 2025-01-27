package fr.sncf.osrd.stdcm.graph

import fr.sncf.osrd.api.FullInfra
import fr.sncf.osrd.api.pathfinding.constraints.ConstraintCombiner
import fr.sncf.osrd.api.pathfinding.constraints.initConstraints
import fr.sncf.osrd.envelope_sim.allowances.utils.AllowanceValue
import fr.sncf.osrd.graph.PathfindingConstraint
import fr.sncf.osrd.graph.PathfindingEdgeLocationId
import fr.sncf.osrd.reporting.exceptions.ErrorType
import fr.sncf.osrd.reporting.exceptions.OSRDError
import fr.sncf.osrd.sim_infra.api.Block
import fr.sncf.osrd.stdcm.*
import fr.sncf.osrd.stdcm.STDCMResult
import fr.sncf.osrd.stdcm.STDCMStep
import fr.sncf.osrd.stdcm.infra_exploration.initInfraExplorerWithEnvelope
import fr.sncf.osrd.stdcm.preprocessing.interfaces.BlockAvailabilityInterface
import fr.sncf.osrd.train.RollingStock
import fr.sncf.osrd.utils.units.Offset
import java.time.Duration
import java.time.Instant
import java.util.*
import kotlin.collections.HashSet

data class EdgeLocation(val edge: STDCMEdge, val offset: Offset<STDCMEdge>)

data class Result(
    val edges: List<STDCMEdge>, // Full path as a list of edges
    val waypoints: List<EdgeLocation>
)

fun findPath(
    fullInfra: FullInfra,
    rollingStock: RollingStock,
    comfort: RollingStock.Comfort?,
    startTime: Double,
    steps: List<STDCMStep>,
    blockAvailability: BlockAvailabilityInterface,
    timeStep: Double,
    maxDepartureDelay: Double,
    maxRunTime: Double,
    tag: String?,
    standardAllowance: AllowanceValue?,
    pathfindingTimeout: Double
): STDCMResult? {
    return STDCMPathfinding(
            fullInfra,
            rollingStock,
            comfort,
            startTime,
            steps,
            blockAvailability,
            timeStep,
            maxDepartureDelay,
            maxRunTime,
            tag,
            standardAllowance,
            pathfindingTimeout
        )
        .findPath()
}

class STDCMPathfinding(
    private val fullInfra: FullInfra,
    private val rollingStock: RollingStock,
    private val comfort: RollingStock.Comfort?,
    private val startTime: Double,
    private val steps: List<STDCMStep>,
    private val blockAvailability: BlockAvailabilityInterface,
    private val timeStep: Double,
    private val maxDepartureDelay: Double,
    private val maxRunTime: Double,
    private val tag: String?,
    private val standardAllowance: AllowanceValue?,
    private val pathfindingTimeout: Double = 120.0
) {

    private var starts: Set<STDCMNode> = HashSet()

    var graph: STDCMGraph =
        STDCMGraph(
            fullInfra,
            rollingStock,
            comfort,
            timeStep,
            blockAvailability,
            maxRunTime,
            startTime,
            steps,
            tag,
            standardAllowance
        )

    fun findPath(): STDCMResult? {
        assert(steps.size >= 2) { "Not enough steps have been set to find a path" }

        val constraints =
            ConstraintCombiner(initConstraints(fullInfra, listOf(rollingStock)).toMutableList())

        assert(steps.last().stop) { "The last stop is supposed to be an actual stop" }
        val stops = steps.filter { it.stop }.map { it.locations }
        assert(stops.isNotEmpty())
        starts =
            convertLocations(
                graph,
                steps[0].locations,
                startTime,
                maxDepartureDelay,
                rollingStock,
                stops,
                listOf(constraints)
            )
        val path = findPathImpl()
        if (path == null) {
            graph.logger.info("Failed to find a path")
            return null
        }
        graph.logger.info("Path found")

        return STDCMPostProcessing(graph)
            .makeResult(
                fullInfra.rawInfra,
                path,
                startTime,
                graph.standardAllowance,
                rollingStock,
                timeStep,
                comfort,
                maxRunTime,
                blockAvailability,
                graph.tag
            )
    }

    private fun findPathImpl(): Result? {
        val queue = PriorityQueue<STDCMNode>()
        for (location in starts) {
            queue.add(location)
        }
        val start = Instant.now()
        while (true) {
            if (Duration.between(start, Instant.now()).toSeconds() >= pathfindingTimeout)
                throw OSRDError(ErrorType.PathfindingTimeoutError)
            val endNode = queue.poll() ?: return null
            if (endNode.timeSinceDeparture + endNode.remainingTimeEstimation > maxRunTime)
                return null
            if (endNode.waypointIndex >= graph.steps.size - 1) {
                return buildResult(endNode)
            }
            queue += getAdjacentNodes(endNode)
        }
    }

    private fun getAdjacentNodes(node: STDCMNode): Collection<STDCMNode> {
        return graph.getAdjacentEdges(node).map { it.getEdgeEnd(graph) }
    }

    private fun buildResult(node: STDCMNode): Result {
        var mutLastEdge: STDCMEdge? = node.previousEdge
        val edges = ArrayDeque<STDCMEdge>()

        while (mutLastEdge != null) {
            edges.addFirst(mutLastEdge)
            mutLastEdge = mutLastEdge.previousNode?.previousEdge
            if (mutLastEdge == null) {
                break
            }
        }

        val edgeList = edges.toList()
        return Result(edgeList, makeWaypoints(edgeList))
    }

    private fun makeWaypoints(edges: List<STDCMEdge>): List<EdgeLocation> {
        var nextStepIndex = 0
        var currentEdgeIndex = 0
        val res = mutableListOf<EdgeLocation>()
        while (currentEdgeIndex < edges.size && nextStepIndex < steps.size) {
            val step = steps[nextStepIndex]
            val edge = edges[currentEdgeIndex]
            val locationOnEdge =
                step.locations
                    .filter { it.edge == edge.block }
                    .mapNotNull { edge.edgeOffsetFromBlock(it.offset) }
                    .minOrNull()
            // Sometimes a step has several locations on the same edge, we just pick the first
            if (locationOnEdge != null) {
                res.add(EdgeLocation(edge, locationOnEdge))
                nextStepIndex++
            } else {
                currentEdgeIndex++
            }
        }
        assert(nextStepIndex == steps.size)
        assert(currentEdgeIndex == edges.size - 1)
        return res
    }

    /** Converts locations on a block id into a location on a STDCMGraph.Edge. */
    private fun convertLocations(
        graph: STDCMGraph,
        locations: Collection<PathfindingEdgeLocationId<Block>>,
        startTime: Double,
        maxDepartureDelay: Double,
        rollingStock: RollingStock,
        stops: List<Collection<PathfindingEdgeLocationId<Block>>> = listOf(),
        constraints: List<PathfindingConstraint<Block>>
    ): Set<STDCMNode> {
        val res = HashSet<STDCMNode>()

        for (location in locations) {
            val infraExplorers =
                initInfraExplorerWithEnvelope(fullInfra, location, rollingStock, stops, constraints)
            val extended = infraExplorers.flatMap { extendLookaheadUntil(it, 3) }
            for (explorer in extended) {
                val edges =
                    STDCMEdgeBuilder(explorer, graph)
                        .setStartTime(startTime)
                        .setStartOffset(location.offset)
                        .setPrevMaximumAddedDelay(maxDepartureDelay)
                        .makeAllEdges()
                for (edge in edges) {
                    res.add(edge.getEdgeEnd(graph))
                }
            }
        }
        return res
    }
}
