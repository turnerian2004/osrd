import React from 'react';

import { Plus } from '@osrd-project/ui-icons';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { osrdEditoastApi } from 'common/api/osrdEditoastApi';
import type { InfraState, TrainScheduleBatchItem } from 'common/api/osrdEditoastApi';
import { useOsrdConfSelectors } from 'common/osrdContext';
import formatConf from 'modules/trainschedule/components/ManageTrainSchedule/helpers/formatConf';
import trainNameWithNum from 'modules/trainschedule/components/ManageTrainSchedule/helpers/trainNameHelper';
import { setFailure, setSuccess } from 'reducers/main';
import { useAppDispatch } from 'store';
import { castErrorToFailure } from 'utils/error';
import { time2sec, sec2time } from 'utils/timeManipulation';

type SubmitConfAddTrainScheduleProps = {
  infraState?: InfraState;
  refetchTimetable: () => void;
  refetchConflicts: () => void;
  setIsWorking: (isWorking: boolean) => void;
  setTrainResultsToFetch: (trainScheduleIds?: number[]) => void;
};

export default function SubmitConfAddTrainSchedule({
  infraState,
  refetchTimetable,
  refetchConflicts,
  setIsWorking,
  setTrainResultsToFetch,
}: SubmitConfAddTrainScheduleProps) {
  const [postTrainSchedule] =
    osrdEditoastApi.endpoints.postTrainScheduleStandaloneSimulation.useMutation();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['operationalStudies/manageTrainSchedule']);

  const { getConf } = useOsrdConfSelectors();
  const simulationConf = useSelector(getConf);
  const {
    pathfindingID,
    timetableID,
    departureTime,
    trainCount,
    trainDelta,
    trainStep,
    name: confName,
  } = simulationConf;

  async function submitConfAddTrainSchedules() {
    const osrdConfig = formatConf(dispatch, t, simulationConf);

    if (!pathfindingID) {
      dispatch(
        setFailure({
          name: t('errorMessages.error'),
          message: t(`errorMessages.noPathfinding`),
        })
      );
    } else if (osrdConfig && timetableID) {
      setIsWorking(true);
      const formattedDepartureTime = time2sec(departureTime);
      const schedules: TrainScheduleBatchItem[] = [];
      let actualTrainCount = 1;
      for (let nb = 1; nb <= trainCount; nb += 1) {
        const newDepartureTimeString = sec2time(
          formattedDepartureTime + 60 * trainDelta * (nb - 1)
        );
        const trainName = trainNameWithNum(confName, actualTrainCount, trainCount);
        const schedule = formatConf(dispatch, t, {
          ...simulationConf,
          name: trainName,
          departureTime: newDepartureTimeString,
        });
        if (schedule) {
          schedules.push(schedule);
        }
        actualTrainCount += trainStep;
      }

      try {
        const newTrainIds = await postTrainSchedule({
          body: {
            path: pathfindingID,
            schedules,
            timetable: timetableID,
          },
        }).unwrap();

        dispatch(
          setSuccess({
            title: t('trainAdded'),
            text: `${confName}: ${sec2time(formattedDepartureTime)}`,
          })
        );
        setIsWorking(false);
        setTrainResultsToFetch(newTrainIds);
        refetchTimetable();
        refetchConflicts();
      } catch (e) {
        setIsWorking(false);
        dispatch(setFailure(castErrorToFailure(e)));
      }
    }
  }

  return (
    <button
      className="btn btn-primary mb-2"
      type="button"
      disabled={infraState !== 'CACHED'}
      onClick={submitConfAddTrainSchedules}
      data-testid="add-train-schedules"
    >
      <span className="mr-2">
        <Plus size="lg" />
      </span>
      {t('addTrainSchedule')}
    </button>
  );
}
