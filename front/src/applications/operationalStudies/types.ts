import type {
  PathProperties,
  PathResponse,
  ProjectPathTrainResult,
  SimulationResponse,
} from 'common/api/osrdEditoastApi';
import type { SuggestedOP } from 'modules/trainschedule/components/ManageTrainSchedule/types';

export interface Destination {
  uic: number;
  yard?: string;
  name: string;
  trigram: string;
  latitude: number;
  longitude: number;
}

export interface Step extends Destination {
  arrivalTime: string;
  departureTime: string;
  duration?: number;
  tracks: {
    position: number;
    track: string;
  }[];
}
export interface StepV2 extends Destination {
  arrivalTime: string;
  departureTime: string;
  duration?: number;
}

export type TrainSchedule = {
  trainNumber: string;
  rollingStock: string | null;
  departureTime: string;
  arrivalTime: string;
  departure: string;
  steps: Step[];
  transilienName?: string;
};

export type TrainScheduleV2 = {
  trainNumber: string;
  rollingStock: string | null;
  departureTime: string;
  arrivalTime: string;
  departure: string;
  steps: StepV2[];
  transilienName?: string;
};

export interface TrainScheduleWithPathRef extends TrainSchedule {
  pathRef: string;
}

export interface TrainScheduleWithPath extends TrainScheduleWithPathRef {
  pathId: number;
  rollingStockId: number;
  pathFinding: PathResponse;
}

export type ImportedTrainSchedule = {
  trainNumber: string;
  rollingStock: string | null;
  departureTime: string;
  arrivalTime: string;
  departure: string;
  steps: (Destination & {
    arrivalTime: string;
    departureTime: string;
  })[];
  transilienName?: string;
};

export type TrainScheduleImportConfig = {
  from: string;
  to: string;
  date: string;
  startTime: string;
  endTime: string;
};

// Extraction of some required and non nullable properties from osrdEditoastApi's PathProperties type
export type ManageTrainSchedulePathProperties = {
  electrifications: NonNullable<PathProperties['electrifications']>;
  geometry: NonNullable<PathProperties['geometry']>;
  suggestedOperationalPoints: SuggestedOP[];
  /** Operational points along the path (including origin and destination) and vias added by clicking on map */
  allWaypoints: SuggestedOP[];
  length: number;
};

/**
 * Properties signal_updates time_end and time_start are in seconds taking count of the departure time
 */
export type TrainSpaceTimeData = {
  id: number;
  trainName: string;
  spaceTimeCurves: { time: number; headPosition: number; tailPosition: number }[][];
} & Omit<ProjectPathTrainResult, 'space_time_curves'>;

export type PositionData<T extends 'gradient' | 'radius'> = {
  [key in T]: number;
} & {
  position: number;
};

export type ElectrificationRangeV2 = {
  electrificationUsage: ElectrificationUsageV2;
  start: number;
  stop: number;
};

export type ElectrificationUsageV2 = ElectrificationValue &
  SimulationResponseSuccess['electrical_profiles']['values'][number];

export type BoundariesData = {
  /** List of `n` boundaries of the ranges.
        A boundary is a distance from the beginning of the path in mm. */
  boundaries: number[];
  /** List of `n+1` values associated to the ranges */
  values: number[];
};

export type ElectricalBoundariesData<T extends ElectrificationValue | ElectricalProfileValue> = {
  boundaries: number[];
  values: T[];
};

export type ElectricalRangesData<T extends ElectrificationValue | ElectricalProfileValue> = {
  start: number;
  stop: number;
  values: T;
};

export type ElectrificationValue = NonNullable<
  PathProperties['electrifications']
>['values'][number];

export type ElectricalProfileValue = Extract<
  SimulationResponse,
  { status: 'success' }
>['electrical_profiles']['values'][number];

/**
 * Electrifications start and stop are in meters
 */
export type PathPropertiesFormatted = {
  electrifications: ElectrificationRangeV2[];
  curves: PositionData<'radius'>[];
  slopes: PositionData<'gradient'>[];
  operationalPoints: NonNullable<PathProperties['operational_points']>;
  geometry: NonNullable<PathProperties['geometry']>;
};

export type SimulationResponseSuccess = Extract<SimulationResponse, { status: 'success' }>;
