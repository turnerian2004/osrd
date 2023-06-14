import React from 'react';
import { store } from 'Store';
import { FaPlus } from 'react-icons/fa';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { setFailure, setSuccess } from 'reducers/main';
import { time2sec, sec2time } from 'utils/timeManipulation';
import getTimetable from 'applications/operationalStudies/components/Scenario/getTimetable';
import formatConf from 'applications/operationalStudies/components/ManageTrainSchedule/helpers/formatConf';
import trainNameWithNum from 'applications/operationalStudies/components/ManageTrainSchedule/helpers/trainNameHelper';
import {
  Allowance,
  PowerRestrictionRange,
  TrainScheduleOptions,
  osrdMiddlewareApi,
} from 'common/api/osrdMiddlewareApi';
import { Comfort, Infra } from 'common/api/osrdEditoastApi';

type Props = {
  infraState?: Infra['state'];
  setIsWorking: (isWorking: boolean) => void;
};

type ScheduleType = {
  train_name?: string;
  rolling_stock?: number;
  departure_time?: number;
  initial_speed?: number;
  labels?: string[];
  allowances?: Allowance[];
  speed_limit_tags?: string;
  comfort?: Comfort;
  power_restriction_ranges?: PowerRestrictionRange[] | null;
  options?: TrainScheduleOptions | null;
};

export default function SubmitConfAddTrainSchedule({ infraState, setIsWorking }: Props) {
  const [postTrainSchedule] = osrdMiddlewareApi.usePostTrainScheduleStandaloneSimulationMutation();
  const dispatch = useDispatch();
  const { t } = useTranslation(['operationalStudies/manageTrainSchedule']);

  async function submitConfAddTrainSchedules() {
    const { osrdconf } = store.getState();
    const osrdConfig = formatConf(dispatch, t, osrdconf.simulationConf);

    if (osrdConfig) {
      setIsWorking(true);
      const departureTime = time2sec(osrdconf.simulationConf.departureTime);
      const schedules: ScheduleType[] = [];
      let actualTrainCount = 1;
      for (let nb = 1; nb <= osrdconf.simulationConf.trainCount; nb += 1) {
        const newDepartureTimeString = sec2time(
          departureTime + 60 * osrdconf.simulationConf.trainDelta * (nb - 1)
        );
        const trainName = trainNameWithNum(
          osrdconf.simulationConf.name,
          actualTrainCount,
          osrdconf.simulationConf.trainCount
        );
        const schedule = formatConf(dispatch, t, {
          ...osrdconf.simulationConf,
          name: trainName,
          departureTime: newDepartureTimeString,
        });
        if (schedule) {
          schedules.push(schedule);
        }
        actualTrainCount += osrdconf.simulationConf.trainStep;
      }

      try {
        await postTrainSchedule({
          standaloneSimulationParameters: {
            timetable: osrdconf.simulationConf.timetableID,
            path: osrdconf.simulationConf.pathfindingID,
            schedules,
          },
        }).unwrap();
        dispatch(
          setSuccess({
            title: t('trainAdded'),
            text: `${osrdconf.simulationConf.name}: ${sec2time(departureTime)}`,
          })
        );
        setIsWorking(false);
        getTimetable(osrdconf.simulationConf.timetableID);
      } catch (e: unknown) {
        setIsWorking(false);
        if (e instanceof Error) {
          dispatch(
            setFailure({
              name: e.name,
              message: t(`errorMessages.${e.message}`),
            })
          );
        }
      }
    }
  }

  return (
    <button
      className="btn btn-primary mb-2"
      type="button"
      disabled={infraState !== 'CACHED'}
      onClick={submitConfAddTrainSchedules}
    >
      <span className="mr-2">
        <FaPlus />
      </span>
      {t('addTrainSchedule')}
    </button>
  );
}