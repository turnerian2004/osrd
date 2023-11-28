package fr.sncf.osrd.api.pathfinding.constraints

import com.google.common.collect.Range
import com.google.common.collect.RangeSet
import com.google.common.collect.TreeRangeSet
import fr.sncf.osrd.api.pathfinding.makePathProps
import fr.sncf.osrd.graph.EdgeToRanges
import fr.sncf.osrd.graph.Pathfinding
import fr.sncf.osrd.sim_infra.api.BlockId
import fr.sncf.osrd.sim_infra.api.BlockInfra
import fr.sncf.osrd.sim_infra.api.PathProperties
import fr.sncf.osrd.sim_infra.api.RawSignalingInfra
import fr.sncf.osrd.train.RollingStock
import fr.sncf.osrd.utils.DistanceRangeMap
import fr.sncf.osrd.utils.units.Distance
import java.util.stream.Collectors

@JvmRecord
data class ElectrificationConstraints(
    val blockInfra: BlockInfra,
    val rawInfra: RawSignalingInfra,
    val rollingStocks: Collection<RollingStock>
) : EdgeToRanges<BlockId> {
    override fun apply(edge: BlockId): MutableCollection<Pathfinding.Range> {
        val res = HashSet<Pathfinding.Range>()
        val path = makePathProps(blockInfra, rawInfra, edge)
        for (stock in rollingStocks)
            res.addAll(getBlockedRanges(stock, path))
        return res
    }

    companion object {
        /**
         * Returns the sections of the given block that can't be used by the given rolling stock
         * because it needs electrified tracks and isn't compatible with the catenaries in some range
         */
        private fun getBlockedRanges(stock: RollingStock, path: PathProperties): Set<Pathfinding.Range> {
            if (stock.isThermal)
                return setOf()
            val res = HashSet<Pathfinding.Range>()
            val voltages = path.getCatenary()
            val neutralSections = rangeSetFromMap(path.getNeutralSections())
            for ((lower, upper, value) in voltages) {
                if (lower == upper)
                    continue
                if (!stock.modeNames.contains(value)) {
                    val voltageInterval = Range.open(lower, upper)
                    val blockingRanges = neutralSections.complement().subRangeSet(voltageInterval).asRanges()
                    for (blockingRange in blockingRanges) {
                        assert(blockingRange.lowerEndpoint() < blockingRange.upperEndpoint())
                        res.add(Pathfinding.Range(blockingRange.lowerEndpoint(), blockingRange.upperEndpoint()))
                    }
                }
            }
            return res
        }

        private fun <T> rangeSetFromMap(rangeMap: DistanceRangeMap<T>): RangeSet<Distance> {
            return TreeRangeSet.create(
                rangeMap.asList().stream()
                    .map { (lower, upper): DistanceRangeMap.RangeMapEntry<T> ->
                        Range.closed(
                            lower, upper
                        )
                    }
                    .collect(Collectors.toSet())
            )
        }
    }
}