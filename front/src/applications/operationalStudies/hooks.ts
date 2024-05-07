import { useEffect } from 'react';

import { useSelector } from 'react-redux';

import { enhancedEditoastApi } from 'common/api/enhancedEditoastApi';
import {
  osrdEditoastApi,
  type PostV2InfraByInfraIdPathPropertiesApiArg,
  type PostV2InfraByInfraIdPathfindingBlocksApiArg,
} from 'common/api/osrdEditoastApi';
import { useOsrdConfActions, useOsrdConfSelectors } from 'common/osrdContext';
import { formatSuggestedOperationalPoints, insertViasInOPs } from 'modules/pathfinding/utils';
import { getSupportedElectrification, isThermal } from 'modules/rollingStock/helpers/electric';
import { adjustConfWithTrainToModifyV2 } from 'modules/trainschedule/components/ManageTrainSchedule/helpers/adjustConfWithTrainToModify';
import type { SuggestedOP } from 'modules/trainschedule/components/ManageTrainSchedule/types';
import { setFailure } from 'reducers/main';
import type { PathStep } from 'reducers/osrdconf/types';
import { useAppDispatch } from 'store';
import { castErrorToFailure } from 'utils/error';
import { getPointCoordinates } from 'utils/geometry';

import type { ManageTrainSchedulePathProperties } from './types';

/**
 * Hook to relaunch the pathfinding when editing a train
 */
export const useSetupItineraryForTrainUpdate = (
  setPathProperties: (pathProperties: ManageTrainSchedulePathProperties) => void
) => {
  const { getInfraID, getTrainScheduleIDsToModify, getUsingElectricalProfiles } =
    useOsrdConfSelectors();
  const infraId = useSelector(getInfraID);
  const trainScheduleIDsToModify = useSelector(getTrainScheduleIDsToModify);
  const usingElectricalProfiles = useSelector(getUsingElectricalProfiles);
  const dispatch = useAppDispatch();
  const osrdActions = useOsrdConfActions();

  const [getTrainScheduleById] = osrdEditoastApi.endpoints.getV2TrainScheduleById.useLazyQuery({});
  const [getRollingStockByName] =
    osrdEditoastApi.endpoints.getRollingStockNameByRollingStockName.useLazyQuery();
  const [postPathfindingBlocks] =
    osrdEditoastApi.endpoints.postV2InfraByInfraIdPathfindingBlocks.useMutation();
  const [postPathProperties] =
    enhancedEditoastApi.endpoints.postV2InfraByInfraIdPathProperties.useMutation();

  useEffect(() => {
    const setupItineraryForTrainUpdate = async () => {
      const trainSchedule = await getTrainScheduleById({
        id: trainScheduleIDsToModify[0],
      }).unwrap();

      if (infraId) {
        const rollingStock = await getRollingStockByName({
          rollingStockName: trainSchedule.rolling_stock_name,
        }).unwrap();

        // TODO TS2 : Next part might not be needed (except to updePathSteps), we need inly trainSchedulePath and
        // rolling stock infos to relaunch the pathfinding. Check for that in simulation results issue

        const params: PostV2InfraByInfraIdPathfindingBlocksApiArg = {
          infraId,
          pathfindingInputV2: {
            path_items: trainSchedule.path,
            rolling_stock_is_thermal: isThermal(rollingStock.effort_curves.modes),
            rolling_stock_loading_gauge: rollingStock.loading_gauge,
            rolling_stock_supported_electrifications: getSupportedElectrification(
              rollingStock.effort_curves.modes
            ),
            rolling_stock_supported_signaling_systems: rollingStock.supported_signaling_systems,
          },
        };

        try {
          const pathfindingResult = await postPathfindingBlocks(params).unwrap();
          if (pathfindingResult.status === 'success') {
            const pathPropertiesParams: PostV2InfraByInfraIdPathPropertiesApiArg = {
              infraId,
              props: ['electrifications', 'geometry', 'operational_points'],
              pathPropertiesInput: {
                track_section_ranges: pathfindingResult.track_section_ranges,
              },
            };
            const { electrifications, geometry, operational_points } =
              await postPathProperties(pathPropertiesParams).unwrap();

            if (electrifications && geometry && operational_points) {
              const stepsCoordinates = pathfindingResult.path_items_positions.map((position) =>
                getPointCoordinates(geometry, pathfindingResult.length, position)
              );

              const formatedPathSteps: PathStep[] = trainSchedule.path.map((step, i) => ({
                ...step,
                coordinates: stepsCoordinates[i],
                positionOnPath: pathfindingResult.path_items_positions[i],
              }));

              const suggestedOperationalPoints: SuggestedOP[] = formatSuggestedOperationalPoints(
                operational_points,
                geometry,
                pathfindingResult.length
              );
              // TODO TS2 : update operational_points property with vias added on map included in trainSchedule.path
              const updatedSuggestedOPs = insertViasInOPs(
                suggestedOperationalPoints,
                formatedPathSteps
              );

              setPathProperties({
                electrifications,
                geometry,
                suggestedOperationalPoints: updatedSuggestedOPs,
                length: pathfindingResult.length,
              });

              adjustConfWithTrainToModifyV2(
                trainSchedule,
                formatedPathSteps,
                rollingStock.id,
                dispatch,
                usingElectricalProfiles,
                osrdActions
              );
            }
          }
          // TODO TS2 : test errors display after core / editoast connexion for pathProperties
        } catch (e) {
          dispatch(setFailure(castErrorToFailure(e)));
        }
      }
    };

    if (trainScheduleIDsToModify.length > 0) setupItineraryForTrainUpdate();
  }, [trainScheduleIDsToModify]);
};

export default useSetupItineraryForTrainUpdate;