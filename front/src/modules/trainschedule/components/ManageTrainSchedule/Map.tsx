import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import ReactMapGL, { AttributionControl, ScaleControl } from 'react-map-gl/maplibre';
import type { Viewport } from 'reducers/map';
import { updateViewport } from 'reducers/map';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';

import type { MapLayerMouseEvent } from 'maplibre-gl';
import type { NearestPointOnLine } from '@turf/nearest-point-on-line';

/* Main data & layers */
import VirtualLayers from 'modules/simulationResult/components/SimulationResultsMap/VirtualLayers';

import Background from 'common/Map/Layers/Background';

import OSM from 'common/Map/Layers/OSM';
import Hillshade from 'common/Map/Layers/Hillshade';
import Electrifications from 'common/Map/Layers/Electrifications';
import MapButtons from 'common/Map/Buttons/MapButtons';
import PlatformsLayer from 'common/Map/Layers/Platforms';
import NeutralSections from 'common/Map/Layers/extensions/SNCF/NeutralSections';
import OperationalPoints from 'common/Map/Layers/OperationalPoints';

/* Interactions */
import RenderPopup from 'modules/trainschedule/components/ManageTrainSchedule/ManageTrainScheduleMap/RenderPopup';

import Routes from 'common/Map/Layers/Routes';
import Signals from 'common/Map/Layers/Signals';
import Switches from 'common/Map/Layers/Switches';
import TracksOSM from 'common/Map/Layers/TracksOSM';
import Detectors from 'common/Map/Layers/Detectors';
import BufferStops from 'common/Map/Layers/BufferStops';
import SpeedLimits from 'common/Map/Layers/SpeedLimits';
import SearchMarker from 'common/Map/Layers/SearchMarker';
import SnappedMarker from 'common/Map/Layers/SnappedMarker';

/* Objects & various */
import { CUSTOM_ATTRIBUTION } from 'common/Map/const';
import { getMapMouseEventNearestFeature } from 'utils/mapHelper';
import { getMap, getTerrain3DExaggeration } from 'reducers/map/selectors';
import { LAYER_GROUPS_ORDER, LAYERS } from 'config/layerOrder';
import { useMapBlankStyle } from 'common/Map/Layers/blankStyle';
import colors from 'common/Map/Consts/colors';
import IGN_BD_ORTHO from 'common/Map/Layers/IGN_BD_ORTHO';
import IGN_SCAN25 from 'common/Map/Layers/IGN_SCAN25';
import IGN_CADASTRE from 'common/Map/Layers/IGN_CADASTRE';
import LineSearchLayer from 'common/Map/Layers/LineSearchLayer';
import SNCF_PSL from 'common/Map/Layers/extensions/SNCF/PSL';
import Terrain from 'common/Map/Layers/Terrain';
import TracksGeographic from 'common/Map/Layers/TracksGeographic';
import { useInfraID, useOsrdConfActions, useOsrdConfSelectors } from 'common/osrdContext';
import Itinerary from 'modules/trainschedule/components/ManageTrainSchedule/ManageTrainScheduleMap/Itinerary';
import ItineraryMarkers from 'modules/trainschedule/components/ManageTrainSchedule/ManageTrainScheduleMap/ItineraryMarkers';
import { useAppDispatch } from 'store';
import { removeSearchItemMarkersOnMap } from 'common/Map/utils';

const Map = () => {
  const mapBlankStyle = useMapBlankStyle();

  const infraID = useInfraID();
  const terrain3DExaggeration = useSelector(getTerrain3DExaggeration);
  const { viewport, mapSearchMarker, mapStyle, showOSM, layersSettings } = useSelector(getMap);

  const [mapIsLoaded, setMapIsLoaded] = useState(false);
  const [snappedPoint, setSnappedPoint] = useState<NearestPointOnLine>();
  const { urlLat = '', urlLon = '', urlZoom = '', urlBearing = '', urlPitch = '' } = useParams();
  const dispatch = useAppDispatch();
  const updateViewportChange = useCallback(
    (value: Partial<Viewport>) => dispatch(updateViewport(value, undefined)),
    [dispatch]
  );

  const mapRef = useRef<MapRef | null>(null);

  const scaleControlStyle = {
    left: 20,
    bottom: 20,
  };

  const { getFeatureInfoClick } = useOsrdConfSelectors();
  const featureInfoClick = useSelector(getFeatureInfoClick);

  const { updateFeatureInfoClick } = useOsrdConfActions();

  const closeFeatureInfoClickPopup = useCallback(() => {
    if (featureInfoClick.displayPopup) {
      dispatch(
        updateFeatureInfoClick({
          displayPopup: false,
          feature: undefined,
        })
      );
    }
  }, [featureInfoClick]);

  const resetPitchBearing = () => {
    updateViewportChange({
      ...viewport,
      bearing: 0,
      pitch: 0,
    });
  };

  const onFeatureClick = (e: MapLayerMouseEvent) => {
    const result = getMapMouseEventNearestFeature(e, { layersId: ['chartis/tracks-geo/main'] });
    if (
      result &&
      result.feature.properties &&
      result.feature.properties.id &&
      result.feature.geometry.type === 'LineString'
    ) {
      dispatch(
        updateFeatureInfoClick({
          displayPopup: true,
          feature: result.feature,
          coordinates: result.nearest,
        })
      );
    } else {
      dispatch(
        updateFeatureInfoClick({
          displayPopup: false,
          feature: undefined,
        })
      );
    }
    removeSearchItemMarkersOnMap(dispatch);
  };

  const onMoveGetFeature = (e: MapLayerMouseEvent) => {
    const result = getMapMouseEventNearestFeature(e, { layersId: ['chartis/tracks-geo/main'] });
    if (
      result &&
      result.feature.properties &&
      result.feature.properties.id &&
      result.feature.geometry.type === 'LineString'
    ) {
      setSnappedPoint({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: result.nearest,
        },
        properties: {
          distance: result.distance,
        },
      });
    } else {
      setSnappedPoint(undefined);
    }
  };

  const interactiveLayerIds = useMemo(() => {
    const result: Array<string> = [];
    result.push('chartis/tracks-geo/main');
    if (layersSettings.operationalpoints) {
      result.push('chartis/osrd_operational_point/geo');
    }
    if (layersSettings.tvds) {
      result.push('chartis/osrd_tvd_section/geo');
    }
    return result;
  }, [layersSettings]);

  useEffect(() => {
    if (urlLat) {
      updateViewportChange({
        ...viewport,
        latitude: parseFloat(urlLat),
        longitude: parseFloat(urlLon),
        zoom: parseFloat(urlZoom),
        bearing: parseFloat(urlBearing),
        pitch: parseFloat(urlPitch),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <MapButtons
        map={mapRef.current ?? undefined}
        resetPitchBearing={resetPitchBearing}
        closeFeatureInfoClickPopup={closeFeatureInfoClickPopup}
        bearing={viewport.bearing}
        withMapKeyButton
      />
      <ReactMapGL
        ref={mapRef}
        {...viewport}
        style={{ width: '100%', height: '100%' }}
        cursor="pointer"
        mapStyle={mapBlankStyle}
        onMove={(e) => updateViewportChange(e.viewState)}
        onMouseMove={onMoveGetFeature}
        attributionControl={false} // Defined below
        onClick={onFeatureClick}
        onResize={(e) => {
          updateViewportChange({
            width: e.target.getContainer().offsetWidth,
            height: e.target.getContainer().offsetHeight,
          });
        }}
        interactiveLayerIds={interactiveLayerIds}
        touchZoomRotate
        maxPitch={85}
        terrain={
          terrain3DExaggeration
            ? { source: 'terrain', exaggeration: terrain3DExaggeration }
            : undefined
        }
        onLoad={() => {
          setMapIsLoaded(true);
        }}
      >
        <VirtualLayers />
        <AttributionControl position="bottom-right" customAttribution={CUSTOM_ATTRIBUTION} />
        <ScaleControl maxWidth={100} unit="metric" style={scaleControlStyle} />

        <Background
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.BACKGROUND.GROUP]}
        />
        <Terrain />

        <IGN_BD_ORTHO layerOrder={LAYER_GROUPS_ORDER[LAYERS.BACKGROUND.GROUP]} />
        <IGN_SCAN25 layerOrder={LAYER_GROUPS_ORDER[LAYERS.BACKGROUND.GROUP]} />
        <IGN_CADASTRE layerOrder={LAYER_GROUPS_ORDER[LAYERS.BACKGROUND.GROUP]} />

        {mapIsLoaded && showOSM && (
          <>
            <OSM
              mapStyle={mapStyle}
              layerOrder={LAYER_GROUPS_ORDER[LAYERS.BACKGROUND.GROUP]}
              mapIsLoaded={mapIsLoaded}
            />
            <Hillshade
              mapStyle={mapStyle}
              layerOrder={LAYER_GROUPS_ORDER[LAYERS.BACKGROUND.GROUP]}
            />
          </>
        )}

        <PlatformsLayer
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.PLATFORMS.GROUP]}
        />

        <TracksGeographic
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.TRACKS_GEOGRAPHIC.GROUP]}
          infraID={infraID}
        />
        <TracksOSM
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.TRACKS_OSM.GROUP]}
        />

        <Routes
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.ROUTES.GROUP]}
          infraID={infraID}
        />
        <OperationalPoints
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.OPERATIONAL_POINTS.GROUP]}
          infraID={infraID}
        />
        <Electrifications
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.ELECTRIFICATIONS.GROUP]}
          infraID={infraID}
        />
        <NeutralSections
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.DEAD_SECTIONS.GROUP]}
          infraID={infraID}
        />
        <BufferStops
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.BUFFER_STOPS.GROUP]}
          infraID={infraID}
        />
        <Detectors
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.DETECTORS.GROUP]}
          infraID={infraID}
        />
        <Switches
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.SWITCHES.GROUP]}
          infraID={infraID}
        />

        <SpeedLimits
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.SPEED_LIMITS.GROUP]}
          infraID={infraID}
        />
        <SNCF_PSL
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.SPEED_LIMITS.GROUP]}
          infraID={infraID}
        />

        <Signals
          sourceTable="signals"
          colors={colors[mapStyle]}
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.SIGNALS.GROUP]}
          infraID={infraID}
        />
        <LineSearchLayer
          layerOrder={LAYER_GROUPS_ORDER[LAYERS.LINE_SEARCH.GROUP]}
          infraID={infraID}
        />

        <RenderPopup />
        {mapIsLoaded && (
          <>
            <Itinerary layerOrder={LAYER_GROUPS_ORDER[LAYERS.ITINERARY.GROUP]} />
            {mapRef.current && <ItineraryMarkers map={mapRef.current.getMap()} />}
          </>
        )}
        {mapSearchMarker && <SearchMarker data={mapSearchMarker} colors={colors[mapStyle]} />}
        {snappedPoint !== undefined && <SnappedMarker geojson={snappedPoint} />}
      </ReactMapGL>
    </>
  );
};

export default Map;
