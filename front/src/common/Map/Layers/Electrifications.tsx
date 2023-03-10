import React from 'react';
import { useSelector } from 'react-redux';
import { Source } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import { isNil } from 'lodash';

import type { Theme } from 'types';

import { MAP_URL } from 'common/Map/const';
import OrderedLayer from 'common/Map/Layers/OrderedLayer';

import type { RootState } from 'reducers';

interface ElectrificationsProps {
  colors: Theme;
  layerOrder: number;
  infraID: number | undefined;
}

export function getElectrificationsProps({
  colors,
  sourceTable,
}: {
  colors: Theme;
  sourceTable?: string;
}) {
  const res: LayerProps = {
    type: 'line',
    minzoom: 5,
    maxzoom: 24,
    layout: {
      visibility: 'visible',
      'line-join': 'miter',
    },
    paint: {
      'line-color': [
        'let',
        'voltageString',
        ['to-string', ['get', 'voltage']],
        [
          'case',
          ['==', ['var', 'voltageString'], '25000'],
          colors.powerline.color25000V,
          ['==', ['var', 'voltageString'], '15000'],
          colors.powerline.color15000V1623,
          ['==', ['var', 'voltageString'], '3000'],
          colors.powerline.color3000V,
          ['==', ['var', 'voltageString'], '1500'],
          colors.powerline.color1500V,
          ['==', ['var', 'voltageString'], '850'],
          colors.powerline.color850V,
          ['==', ['var', 'voltageString'], '800'],
          colors.powerline.color800V,
          ['==', ['var', 'voltageString'], '750'],
          colors.powerline.color750V,
          colors.powerline.colorOther,
        ],
      ],
      'line-width': 6,
      'line-offset': 0,
      'line-opacity': 1,
      'line-dasharray': [0.1, 0.3],
    },
  };

  if (!isNil(sourceTable)) res['source-layer'] = sourceTable;

  return res;
}

export function getElectrificationsTextParams({
  colors,
  sourceTable,
}: {
  colors: Theme;
  sourceTable?: string;
}) {
  const res: LayerProps = {
    type: 'symbol',
    minzoom: 5,
    maxzoom: 24,
    layout: {
      visibility: 'visible',
      'text-font': ['Roboto Medium'],
      'symbol-placement': 'line-center',
      'text-field': '{voltage}V',
      'text-offset': [0, -1],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 10],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-pitch-alignment': 'auto',
      'text-rotation-alignment': 'auto',
    },
    paint: {
      'text-color': [
        'let',
        'voltageString',
        ['to-string', ['get', 'voltage']],
        [
          'case',
          ['==', ['var', 'voltageString'], '25000'],
          colors.powerline.color25000V,
          ['==', ['var', 'voltageString'], '15000'],
          colors.powerline.color15000V1623,
          ['==', ['var', 'voltageString'], '3000'],
          colors.powerline.color3000V,
          ['==', ['var', 'voltageString'], '1500'],
          colors.powerline.color1500V,
          ['==', ['var', 'voltageString'], '850'],
          colors.powerline.color850V,
          ['==', ['var', 'voltageString'], '800'],
          colors.powerline.color800V,
          ['==', ['var', 'voltageString'], '750'],
          colors.powerline.color750V,
          colors.powerline.colorOther,
        ],
      ],
    },
  };

  if (!isNil(sourceTable)) res['source-layer'] = sourceTable;

  return res;
}

export default function Electrifications({ colors, layerOrder, infraID }: ElectrificationsProps) {
  const { layersSettings } = useSelector((state: RootState) => state.map);
  const electrificationsParams: LayerProps = getElectrificationsProps({
    colors,
    sourceTable: 'electrifications',
  });
  const electrificationsTextParams: LayerProps = getElectrificationsTextParams({
    colors,
    sourceTable: 'electrifications',
  });

  if (layersSettings.electrifications) {
    return (
      <Source
        id="electrifications_geo"
        type="vector"
        url={`${MAP_URL}/layer/electrifications/mvt/geo/?infra=${infraID}`}
      >
        <OrderedLayer
          {...electrificationsParams}
          // beforeId={`chartis/tracks-geo/main`}
          id="chartis/electrifications/geo"
          layerOrder={layerOrder}
        />
        <OrderedLayer
          {...electrificationsTextParams}
          // beforeId={`chartis/tracks-geo/main`}
          id="chartis/electrifications_names/geo"
          layerOrder={layerOrder}
        />
      </Source>
    );
  }
  return null;
}