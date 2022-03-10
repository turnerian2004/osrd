package fr.sncf.osrd.new_infra.implementation.tracks.undirected;

import fr.sncf.osrd.new_infra.api.tracks.undirected.*;
import fr.sncf.osrd.new_infra.implementation.BaseAttributes;

public class InfraSwitchPort extends BaseAttributes implements SwitchPort {
    private final String id;
    public Switch switchRef;

    public InfraSwitchPort(String id) {
        this.id = id;
    }

    @Override
    public String getID() {
        return id;
    }

    @Override
    public Switch getSwitch() {
        return switchRef;
    }
}
