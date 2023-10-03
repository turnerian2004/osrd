import * as d3 from 'd3';
import { noop } from 'lodash';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  isolatedEnableInteractivity,
  updatePointers,
  displayGuide,
  traceVerticalLine,
} from 'modules/simulationResult/components/ChartHelpers/enableInteractivity';
import { Rnd } from 'react-rnd';
import {
  timeShiftTrain,
  interpolateOnTime,
} from 'modules/simulationResult/components/ChartHelpers/ChartHelpers';
import ORSD_GRAPH_SAMPLE_DATA from 'modules/simulationResult/components/SpeedSpaceChart/sampleData';
import { CgLoadbar } from 'react-icons/cg';
import { GiResize } from 'react-icons/gi';
import {
  KEY_VALUES_FOR_SPACE_TIME_CHART,
  LIST_VALUES_NAME_SPACE_TIME,
} from 'modules/simulationResult/components/simulationResultsConsts';
import { isolatedCreateTrain as createTrain } from 'modules/simulationResult/components/SpaceTimeChart/createTrain';

import { drawAllTrains } from 'modules/simulationResult/components/SpaceTimeChart/d3Helpers';
import {
  AllowancesSettings,
  Chart,
  OsrdSimulationState,
  PositionValues,
  SimulationSnapshot,
  Train,
} from 'reducers/osrdsimulation/types';
import ChartModal from 'modules/simulationResult/components/SpaceTimeChart/ChartModal';
import {
  DispatchUpdateDepartureArrivalTimes,
  DispatchUpdateChart,
  DispatchUpdateMustRedraw,
  DispatchUpdateSelectedTrainId,
  DispatchUpdateTimePositionValues,
} from './types';

const CHART_ID = 'SpaceTimeChart';
const CHART_MIN_HEIGHT = 250;

/**
 * @summary A Important chart to study evolution of trains vs time and inside block occupancies
 *
 * @version 1.0
 *
 * Features:
 * - Possible to slide a train and update its departure time
 * - Type " + " or " - " to update departure time by second
 * - use ctrl + third mouse button to zoom it / out
 * - use shift + hold left mouse button to pan
 * - Right-Bottom bottom to switch Scales
 * - Resize vertically
 *
 */

export type SpaceTimeChartProps = {
  allowancesSettings?: AllowancesSettings;
  dispatchUpdateDepartureArrivalTimes?: DispatchUpdateDepartureArrivalTimes;
  dispatchUpdateChart?: DispatchUpdateChart;
  dispatchUpdateMustRedraw?: DispatchUpdateMustRedraw;
  dispatchUpdateSelectedTrainId?: DispatchUpdateSelectedTrainId;
  dispatchUpdateTimePositionValues?: DispatchUpdateTimePositionValues;
  initialHeightOfSpaceTimeChart?: number;
  inputSelectedTrain?: Train;
  positionValues?: PositionValues;
  selectedProjection?: OsrdSimulationState['selectedProjection'];
  simulation?: SimulationSnapshot;
  simulationIsPlaying?: boolean;
  timePosition?: OsrdSimulationState['timePosition'];
  onOffsetTimeByDragging?: (trains: Train[], offset: number) => void;
  onSetBaseHeightOfSpaceTimeChart?: (newHeight: number) => void;
  isDisplayed?: boolean;
};

export default function SpaceTimeChart(props: SpaceTimeChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rndContainerRef = useRef<Rnd>(null);

  const {
    allowancesSettings = ORSD_GRAPH_SAMPLE_DATA.allowancesSettings as AllowancesSettings,
    dispatchUpdateDepartureArrivalTimes = noop,
    dispatchUpdateMustRedraw = noop,
    dispatchUpdateSelectedTrainId = noop,
    dispatchUpdateTimePositionValues = noop,
    dispatchUpdateChart = noop,
    initialHeightOfSpaceTimeChart = 400,
    inputSelectedTrain = ORSD_GRAPH_SAMPLE_DATA.simulation.present.trains[0],
    positionValues = ORSD_GRAPH_SAMPLE_DATA.positionValues,
    selectedProjection,
    simulation = ORSD_GRAPH_SAMPLE_DATA.simulation.present,
    simulationIsPlaying = false,
    timePosition = ORSD_GRAPH_SAMPLE_DATA.timePosition,
    isDisplayed = true,
    onOffsetTimeByDragging = noop,
    onSetBaseHeightOfSpaceTimeChart = noop,
  } = props;

  const [baseHeightOfSpaceTimeChart, setBaseHeightOfSpaceTimeChart] = useState(
    initialHeightOfSpaceTimeChart
  );
  const [chart, setChart] = useState<Chart | undefined>(undefined);
  const [dragOffset, setDragOffset] = useState(0);
  const [heightOfSpaceTimeChart, setHeightOfSpaceTimeChart] = useState(
    initialHeightOfSpaceTimeChart
  );
  const [resetChart, setResetChart] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [selectedTrain, setSelectedTrain] = useState(inputSelectedTrain);
  const [localTime, setLocalTime] = useState(new Date());
  const [, setLocalPosition] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showModal, setShowModal] = useState<'+' | '-' | ''>('');
  const [trainSimulations, setTrainSimulations] = useState<
    SimulationSnapshot['trains'] | undefined
  >(undefined);

  const dragShiftTrain = useCallback(
    (offset: number) => {
      if (trainSimulations) {
        const trains = trainSimulations.map((train) =>
          train.id === selectedTrain.id ? timeShiftTrain(train, offset) : train
        );
        setTrainSimulations(trains);
        onOffsetTimeByDragging(trains, offset);
      }
    },
    [trainSimulations, selectedTrain, onOffsetTimeByDragging]
  );

  const moveGridLinesOnMouseMove = useCallback(() => {
    if (chart?.svg) {
      const verticalMark = mousePos.x;
      const horizontalMark = mousePos.y;
      chart.svg.selectAll('#vertical-line').attr('x1', verticalMark).attr('x2', verticalMark);
      chart.svg.selectAll('#horizontal-line').attr('y1', horizontalMark).attr('y2', horizontalMark);
    }
  }, [chart, rotate, mousePos]);

  /**
   * INPUT UPDATES
   *
   * take into account an input update
   */
  useEffect(() => {
    setTrainSimulations(simulation.trains);
  }, [simulation.trains]);

  useEffect(() => {
    // avoid useless re-render if selectedTrain is already correct
    if (selectedTrain.id !== inputSelectedTrain.id) {
      setSelectedTrain(inputSelectedTrain);
    }
  }, [inputSelectedTrain.id]);

  /**
   * ACTIONS HANDLE
   *
   * everything should be done by Hoc, has no direct effect on Comp behavior
   */
  const toggleRotation = () => {
    if (chart) {
      const newRotate = !rotate;
      setChart({ ...chart, x: chart.y, y: chart.x, rotate: newRotate });
      setRotate(newRotate);
    }
  };

  /*
   * shift the train after a drag and drop
   * dragOffset is in Seconds !! (typecript is nice)
   */
  useEffect(() => {
    dragShiftTrain(dragOffset);
    const offsetLocalTime = new Date(1900, localTime.getMonth(), localTime.getDay());
    offsetLocalTime.setHours(localTime.getHours());
    offsetLocalTime.setMinutes(localTime.getMinutes());
    offsetLocalTime.setSeconds(localTime.getSeconds() + dragOffset);
    if (chart)
      setMousePos({
        ...mousePos,
        x: rotate ? mousePos.x : chart.x(offsetLocalTime),
        y: rotate ? chart.y(offsetLocalTime) : mousePos.y,
      });
    setLocalTime(offsetLocalTime);
  }, [dragOffset]);

  /*
   * redraw the trains if
   * - the simulation trains or the selected train have changed
   * - the chart is rotated or centered (reset)
   * - the window or the chart have been resized (heightOfSpaceTimeChart)
   */
  useEffect(() => {
    if (trainSimulations) {
      const trainsToDraw = trainSimulations.map((train) =>
        createTrain(KEY_VALUES_FOR_SPACE_TIME_CHART, train)
      );
      drawAllTrains(
        allowancesSettings,
        chart,
        CHART_ID,
        dispatchUpdateChart,
        dispatchUpdateDepartureArrivalTimes,
        dispatchUpdateMustRedraw,
        dispatchUpdateSelectedTrainId,
        heightOfSpaceTimeChart,
        KEY_VALUES_FOR_SPACE_TIME_CHART,
        ref,
        resetChart,
        rotate,
        selectedProjection,
        selectedTrain,
        setChart,
        setDragOffset,
        trainSimulations,
        trainsToDraw
      );
      setResetChart(false);
    }
  }, [resetChart, rotate, selectedTrain, trainSimulations, heightOfSpaceTimeChart]);

  /**
   * add behaviour on zoom and mousemove/mouseover/wheel on the new chart each time the chart changes
   */
  useEffect(() => {
    if (trainSimulations) {
      const dataSimulation = createTrain(KEY_VALUES_FOR_SPACE_TIME_CHART, selectedTrain);
      isolatedEnableInteractivity(
        chart,
        dataSimulation,
        KEY_VALUES_FOR_SPACE_TIME_CHART,
        LIST_VALUES_NAME_SPACE_TIME,
        rotate,
        setChart,
        setLocalTime,
        setLocalPosition,
        setMousePos,
        simulationIsPlaying,
        dispatchUpdateMustRedraw,
        dispatchUpdateTimePositionValues
      );
      const immediatePositionsValuesForPointer = interpolateOnTime(
        dataSimulation,
        KEY_VALUES_FOR_SPACE_TIME_CHART,
        LIST_VALUES_NAME_SPACE_TIME,
        localTime
      );
      displayGuide(chart, 1);
      updatePointers(
        chart,
        KEY_VALUES_FOR_SPACE_TIME_CHART,
        LIST_VALUES_NAME_SPACE_TIME,
        immediatePositionsValuesForPointer,
        rotate
      );
      moveGridLinesOnMouseMove();
    }

    // Required to sync the camera in SimulationWarpedMap:
    dispatchUpdateChart(chart);
  }, [chart]);

  /**
   * coordinates the vertical cursors with other graphs (GEV for instance)
   */
  useEffect(() => {
    if (trainSimulations) {
      traceVerticalLine(
        chart,
        selectedTrain,
        KEY_VALUES_FOR_SPACE_TIME_CHART,
        LIST_VALUES_NAME_SPACE_TIME,
        positionValues,
        'headPosition',
        rotate,
        timePosition
      );
    }
  }, [chart, positionValues, timePosition]);

  useEffect(() => {
    moveGridLinesOnMouseMove();
  }, [mousePos]);

  const handleKey = ({ key }: KeyboardEvent) => {
    if (isDisplayed && ['+', '-'].includes(key)) {
      setShowModal(key as '+' | '-');
    }
  };

  const debounceResize = () => {
    const height = (d3.select(`#container-${CHART_ID}`)?.node() as HTMLDivElement).clientHeight;
    setHeightOfSpaceTimeChart(height);
  };

  /**
   * add behaviour: Type " + " or " - " to update departure time by second
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', debounceResize);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', debounceResize);
    };
  }, [isDisplayed]);

  return (
    <Rnd
      ref={rndContainerRef}
      default={{
        x: 0,
        y: 0,
        width: '100%',
        height: `${heightOfSpaceTimeChart}px`,
      }}
      minHeight={CHART_MIN_HEIGHT}
      disableDragging
      enableResizing={{
        bottom: true,
      }}
      onResizeStart={() => {
        setBaseHeightOfSpaceTimeChart(heightOfSpaceTimeChart);
        onSetBaseHeightOfSpaceTimeChart(heightOfSpaceTimeChart);
      }}
      onResize={(_e, _dir, _refToElement, delta) => {
        setHeightOfSpaceTimeChart(baseHeightOfSpaceTimeChart + delta.height);
        onSetBaseHeightOfSpaceTimeChart(baseHeightOfSpaceTimeChart + delta.height);
      }}
    >
      <div
        id={`container-${CHART_ID}`}
        className="spacetime-chart w-100"
        style={{ height: `100%` }}
      >
        {showModal !== '' ? (
          <ChartModal
            modificationKey={showModal}
            setShowModal={setShowModal}
            trainName={selectedTrain?.name}
            offsetTimeByDragging={dragShiftTrain}
          />
        ) : null}
        <div style={{ height: `100%` }} ref={ref} />
        <button
          type="button"
          className="btn-rounded btn-rounded-white box-shadow btn-rotate"
          onClick={() => toggleRotation()}
        >
          <i className="icons-refresh" />
        </button>
        <button
          type="button"
          className="btn-rounded btn-rounded-white box-shadow btn-rotate mr-5"
          onClick={() => {
            setRotate(false);
            setResetChart(true);
          }}
        >
          <GiResize />
        </button>
        <div className="handle-tab-resize">
          <CgLoadbar />
        </div>
      </div>
    </Rnd>
  );
}