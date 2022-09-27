package fr.sncf.osrd.api.stdcm.new_pipeline;

import static fr.sncf.osrd.envelope.part.constraints.EnvelopePartConstraintType.CEILING;
import static fr.sncf.osrd.envelope.part.constraints.EnvelopePartConstraintType.FLOOR;

import com.google.common.collect.Multimap;
import fr.sncf.osrd.envelope.Envelope;
import fr.sncf.osrd.envelope.OverlayEnvelopeBuilder;
import fr.sncf.osrd.envelope.part.ConstrainedEnvelopePartBuilder;
import fr.sncf.osrd.envelope.part.EnvelopePart;
import fr.sncf.osrd.envelope.part.EnvelopePartBuilder;
import fr.sncf.osrd.envelope.part.constraints.EnvelopeConstraint;
import fr.sncf.osrd.envelope.part.constraints.SpeedConstraint;
import fr.sncf.osrd.envelope_sim.EnvelopeProfile;
import fr.sncf.osrd.envelope_sim.EnvelopeSimContext;
import fr.sncf.osrd.envelope_sim.PhysicsPath;
import fr.sncf.osrd.envelope_sim.overlays.EnvelopeDeceleration;
import fr.sncf.osrd.infra.api.signaling.SignalingInfra;
import fr.sncf.osrd.infra.api.signaling.SignalingRoute;
import fr.sncf.osrd.reporting.exceptions.NotImplemented;
import fr.sncf.osrd.train.RollingStock;
import fr.sncf.osrd.utils.graph.Pathfinding;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class STDCMPathfinding {

    /** Given an infra, a rolling stock and a collection of unavailable time for each route,
     * find a path made of a sequence of route ranges with a matching envelope.
     * Returns null if no path is found.
     * */
    public static STDCMResult findPath(
            SignalingInfra infra,
            RollingStock rollingStock,
            double startTime,
            double endTime,
            Set<Pathfinding.EdgeLocation<SignalingRoute>> startLocations,
            Set<Pathfinding.EdgeLocation<SignalingRoute>> endLocations,
            Multimap<SignalingRoute, OccupancyBlock> unavailableTimes
    ) {
        var graph = new STDCMGraph(infra, rollingStock, unavailableTimes);
        var path = Pathfinding.findPath(
                graph,
                List.of(
                        convertLocations(graph, startLocations, startTime),
                        convertLocations(graph, endLocations, 0)
                ),
                edge -> edge.route().getInfraRoute().getLength(),
                null
        );
        return makeResult(path, rollingStock);
    }

    private static STDCMResult makeResult(Pathfinding.Result<STDCMGraph.Edge> path, RollingStock rollingStock) {
        var routeRanges = path.ranges().stream()
                .map(x -> new Pathfinding.EdgeRange<>(x.edge().route(), x.start(), x.end()))
                .toList();
        var routeWaypoints = path.waypoints().stream()
                .map(x -> new Pathfinding.EdgeLocation<>(x.edge().route(), x.offset()))
                .toList();
        return new STDCMResult(
                new Pathfinding.Result<>(routeRanges, routeWaypoints),
                makeFinalEnvelope(path.ranges(), rollingStock)
        );
    }

    private static Envelope makeFinalEnvelope(
            List<Pathfinding.EdgeRange<STDCMGraph.Edge>> edges,
            RollingStock rollingStock
    ) {
        var parts = new ArrayList<EnvelopePart>();
        for (var edge : edges) {
            edge.edge().envelope().stream()
                    .forEach(parts::add);
        }
        var newEnvelope = Envelope.make(parts.toArray(new EnvelopePart[0]));
        return addFinalBraking(edges, newEnvelope, rollingStock);
    }

    private static Envelope addFinalBraking(
            List<Pathfinding.EdgeRange<STDCMGraph.Edge>> edges,
            Envelope envelope,
            RollingStock rollingStock
    ) {
        var partBuilder = new EnvelopePartBuilder();
        partBuilder.setAttr(EnvelopeProfile.BRAKING);
        var overlayBuilder = new ConstrainedEnvelopePartBuilder(
                partBuilder,
                new SpeedConstraint(0, FLOOR),
                new EnvelopeConstraint(envelope, CEILING)
        );
        var path = makePath(edges);
        var context = new EnvelopeSimContext(rollingStock, path, 2.);
        EnvelopeDeceleration.decelerate(context, path.getLength(), 0, overlayBuilder, -1);

        var builder = OverlayEnvelopeBuilder.backward(envelope);
        builder.addPart(partBuilder.build());
        return builder.build();
    }

    private static PhysicsPath makePath(
            List<Pathfinding.EdgeRange<STDCMGraph.Edge>> edges
    ) {
        throw new NotImplemented();
    }


    private static Set<Pathfinding.EdgeLocation<STDCMGraph.Edge>> convertLocations(
            STDCMGraph graph,
            Set<Pathfinding.EdgeLocation<SignalingRoute>> locations,
            double startTime
    ) {
        var res = new HashSet<Pathfinding.EdgeLocation<STDCMGraph.Edge>>();
        for (var location : locations) {
            var edge = graph.makeEdge(location.edge(), startTime, 0);
            res.add(new Pathfinding.EdgeLocation<>(edge, location.offset()));
        }
        return res;
    }
}
