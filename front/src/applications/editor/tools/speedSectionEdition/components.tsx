import { mapValues, cloneDeep, isEqual, map, isEmpty, mapKeys, omit, isNumber } from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Popup, Source } from 'react-map-gl';
import { useTranslation } from 'react-i18next';
import { featureCollection } from '@turf/helpers';
import { Feature, FeatureCollection, LineString, Point } from 'geojson';
import React, { FC, InputHTMLAttributes, useContext, useEffect, useMemo, useState } from 'react';
import { BsArrowBarRight } from 'react-icons/bs';
import { AiFillSave, AiOutlinePlusCircle, FaTimes, MdShowChart } from 'react-icons/all';
import { FaFlagCheckered } from 'react-icons/fa';
import { MdSpeed } from 'react-icons/md';

import EditorContext from '../../context';
import { SpeedSectionEditionState, TrackState } from './types';
import { ExtendedEditorContextType, LayerType } from '../types';
import colors from '../../../../common/Map/Consts/colors';
import GeoJSONs, { SourcesDefinitionsIndex } from '../../../../common/Map/Layers/GeoJSONs';
import { getMap } from '../../../../reducers/map/selectors';
import {
  APPLICABLE_DIRECTIONS,
  ApplicableDirection,
  EntityObjectOperationResult,
  TrackSectionEntity,
} from '../../../../types';
import { getEntities } from '../../data/api';
import { getInfraID } from '../../../../reducers/osrdconf/selectors';
import { getPointAt, getTrackRangeFeatures, kmhToMs, msToKmh } from './utils';
import { flattenEntity, NEW_ENTITY_ID } from '../../data/utils';
import { LoaderFill } from '../../../../common/Loader';
import EntitySumUp from '../../components/EntitySumUp';
import { save } from '../../../../reducers/editor';

const DEFAULT_DISPLAYED_RANGES_COUNT = 5;

export const TrackRangesList: FC = () => {
  const {
    state: { entity, trackSectionsCache },
    setState,
  } = useContext(EditorContext) as ExtendedEditorContextType<SpeedSectionEditionState>;
  const { t } = useTranslation();
  const ranges = entity.properties.track_ranges || [];
  const [showAll, setShowAll] = useState(false);

  return (
    <div>
      <h4 className="pb-0">
        <MdShowChart className="me-1" /> {t('Editor.tools.speed-edition.linked-track-sections')}
      </h4>
      <ul className="list-unstyled">
        {(showAll ? ranges : ranges.slice(0, DEFAULT_DISPLAYED_RANGES_COUNT)).map((range, i) => {
          const trackState = trackSectionsCache[range.track];

          return (
            <li key={i} className="mb-4 d-flex flex-row align-items-center">
              {(!trackState || trackState.type === 'loading') && (
                <div className="position-relative w-100" style={{ height: 50 }}>
                  <LoaderFill className="bg-transparent" />
                </div>
              )}
              {trackState?.type === 'success' && (
                <>
                  <div className="flex-shrink-0 mr-3 d-flex flex-column">
                    <small>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2 mb-1"
                        title={t('Editor.tools.speed-edition.edit-track-range-start')}
                        onClick={() => {
                          setState({
                            hoveredItem: null,
                            interactionState: {
                              type: 'movePoint',
                              rangeIndex: i,
                              extremity: 'BEGIN',
                            },
                          });
                        }}
                        onMouseLeave={() => setState({ hoveredItem: null })}
                        onMouseEnter={() =>
                          setState({
                            hoveredItem: {
                              speedSectionItemType: 'TrackRangeExtremity',
                              track: trackState.track,
                              position: getPointAt(trackState.track, range.begin),
                              extremity: 'BEGIN',
                            },
                          })
                        }
                      >
                        <BsArrowBarRight />
                      </button>
                    </small>
                    <small>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2 mb-1"
                        title={t('Editor.tools.speed-edition.edit-track-range-end')}
                        onClick={() => {
                          setState({
                            hoveredItem: null,
                            interactionState: {
                              type: 'movePoint',
                              rangeIndex: i,
                              extremity: 'END',
                            },
                          });
                        }}
                        onMouseLeave={() => setState({ hoveredItem: null })}
                        onMouseEnter={() =>
                          setState({
                            hoveredItem: {
                              speedSectionItemType: 'TrackRangeExtremity',
                              track: trackState.track,
                              position: getPointAt(trackState.track, range.end),
                              extremity: 'END',
                            },
                          })
                        }
                      >
                        <FaFlagCheckered />
                      </button>
                    </small>
                    <small>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2"
                        title={t('common.delete')}
                        onClick={() => {
                          const newEntity = cloneDeep(entity);
                          newEntity.properties.track_ranges?.splice(i, 1);
                          setState({ entity: newEntity, hoveredItem: null });
                        }}
                        onMouseLeave={() => setState({ hoveredItem: null })}
                        onMouseEnter={() =>
                          setState({
                            hoveredItem: {
                              speedSectionItemType: 'TrackRange',
                              track: trackState.track,
                              position: getPointAt(
                                trackState.track,
                                trackState.track.properties.length / 2
                              ),
                            },
                          })
                        }
                      >
                        <FaTimes />
                      </button>
                    </small>
                  </div>
                  <div className="flex-grow-1 flex-shrink-1">
                    <EntitySumUp entity={trackState.track} />
                    <div>
                      <select
                        id="filterLevel"
                        className="form-control"
                        value={range.applicable_directions}
                        onChange={(e) => {
                          const newEntity = cloneDeep(entity);
                          const newRange = (newEntity.properties.track_ranges || [])[i];
                          newRange.applicable_directions = e.target.value as ApplicableDirection;
                          setState({ entity: newEntity, hoveredItem: null });
                        }}
                      >
                        {APPLICABLE_DIRECTIONS.map((direction) => (
                          <option key={direction} value={direction}>
                            {t(`Editor.directions.${direction}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {ranges.length > DEFAULT_DISPLAYED_RANGES_COUNT && (
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-secondary w-100 text-wrap"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? t('Editor.tools.speed-edition.only-show-n', {
                  count: DEFAULT_DISPLAYED_RANGES_COUNT,
                })
              : t('Editor.tools.speed-edition.show-more-ranges', {
                  count: ranges.length - DEFAULT_DISPLAYED_RANGES_COUNT,
                })}
          </button>
        </div>
      )}
    </div>
  );
};

function msToKmhString(msSpeed: number | undefined): string {
  return isNumber(msSpeed) ? msToKmh(msSpeed).toFixed(2) : '';
}
const SpeedInput: FC<
  {
    msSpeed: number | undefined;
    onChange: (newMsSpeed: number | undefined) => void;
  } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>
> = ({ msSpeed, onChange, ...attrs }) => {
  const [kmhSpeed, setKmhSpeed] = useState<string>(msToKmhString(msSpeed));

  useEffect(() => {
    const newKmhSpeed = msToKmhString(msSpeed);
    if (+newKmhSpeed !== +kmhSpeed) setKmhSpeed(newKmhSpeed);
  }, [msSpeed]);

  return (
    <input
      min={0}
      step={0.1}
      {...attrs}
      type="number"
      value={kmhSpeed}
      onChange={(e) => {
        setKmhSpeed(e.target.value);
        const newKmhSpeed = +e.target.value;
        const newMsSpeed = isNumber(newKmhSpeed) ? kmhToMs(newKmhSpeed) : undefined;
        if (newMsSpeed !== msSpeed) onChange(newMsSpeed);
      }}
    />
  );
};

export const MetadataForm: FC = () => {
  const { t } = useTranslation();
  const {
    state: { entity },
    setState,
  } = useContext(EditorContext) as ExtendedEditorContextType<SpeedSectionEditionState>;

  return (
    <div>
      <h4 className="pb-0">
        <MdSpeed className="me-1" /> {t('Editor.tools.speed-edition.speed-limits')}
      </h4>
      {/* The following tag is here to mimick other tools' forms style: */}
      <form className="rjsf" onSubmit={(e) => e.preventDefault()}>
        <div className="form-group field field-string mb-2">
          <label className="control-label" htmlFor="speed-section.main-limit">
            {t('Editor.tools.speed-edition.main-speed-limit')}
          </label>
          <div className="d-flex flex-row align-items-center">
            <SpeedInput
              className="form-control flex-grow-1 flex-shrink-1"
              id="speed-section.main-limit"
              placeholder=""
              msSpeed={entity.properties.speed_limit || undefined}
              onChange={(newMsSpeed) => {
                const newEntity = cloneDeep(entity);
                newEntity.properties.speed_limit = newMsSpeed;
                setState({ entity: newEntity });
              }}
            />
            <span className="text-muted ml-2">km/h</span>
          </div>
        </div>
        {!isEmpty(entity.properties.speed_limit_by_tag) && (
          <div className="control-label mb-1">
            {t('Editor.tools.speed-edition.additional-speed-limit')}
          </div>
        )}
        {map(entity.properties.speed_limit_by_tag || {}, (value, key) => (
          <div className="form-group field field-string">
            <div className="d-flex flex-row align-items-center">
              <input
                className="form-control flex-grow-2 flex-shrink-1 mr-2"
                placeholder=""
                type="text"
                value={key}
                onChange={(e) => {
                  const newEntity = cloneDeep(entity);
                  const newKey = e.target.value;
                  newEntity.properties.speed_limit_by_tag = mapKeys(
                    newEntity.properties.speed_limit_by_tag || {},
                    (_v, k) => (k === key ? newKey : k)
                  );
                  setState({ entity: newEntity });
                }}
              />
              <SpeedInput
                className="form-control flex-shrink-0 px-2"
                style={{ width: '5em' }}
                placeholder=""
                msSpeed={value}
                onChange={(newMsSpeed) => {
                  const newEntity = cloneDeep(entity);
                  newEntity.properties.speed_limit_by_tag =
                    newEntity.properties.speed_limit_by_tag || {};
                  newEntity.properties.speed_limit_by_tag[key] = newMsSpeed;
                  setState({ entity: newEntity });
                }}
              />
              <span className="text-muted ml-2">km/h</span>
              <small>
                <button
                  type="button"
                  className="btn btn-primary btn-sm px-2 ml-2"
                  title={t('commons.delete')}
                  onClick={() => {
                    const newEntity = cloneDeep(entity);
                    newEntity.properties.speed_limit_by_tag = omit(
                      newEntity.properties.speed_limit_by_tag || {},
                      key
                    );
                    setState({ entity: newEntity });
                  }}
                >
                  <FaTimes />
                </button>
              </small>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary w-100 text-wrap small mb-2"
          onClick={async () => {
            const newEntity = cloneDeep(entity);
            newEntity.properties.speed_limit_by_tag = newEntity.properties.speed_limit_by_tag || {};
            let key = t('Editor.tools.speed-edition.new-tag');
            let i = 1;
            if (newEntity.properties.speed_limit_by_tag[key]) {
              while (newEntity.properties.speed_limit_by_tag[`${key} ${i}`]) i += 1;
              key += ` ${i}`;
            }
            newEntity.properties.speed_limit_by_tag[key] = kmhToMs(80);
            setState({ entity: newEntity });
          }}
        >
          <AiOutlinePlusCircle className="mr-2" />
          {t('Editor.tools.speed-edition.add-new-speed-limit')}
        </button>
      </form>
    </div>
  );
};

export const SpeedSectionEditionLeftPanel: FC = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const {
    setState,
    state: { entity, initialEntity },
  } = useContext(EditorContext) as ExtendedEditorContextType<SpeedSectionEditionState>;
  const isNew = entity.properties.id === NEW_ENTITY_ID;
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div>
      <legend>{t('Editor.obj-types.SpeedSection')}</legend>
      <div className="my-4">
        <button
          type="button"
          className="btn btn-primary w-100 text-wrap"
          disabled={isLoading || isEqual(entity, initialEntity)}
          onClick={async () => {
            setIsLoading(true);

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const res: any = await dispatch(
                save(
                  !isNew
                    ? {
                        update: [
                          {
                            source: initialEntity,
                            target: entity,
                          },
                        ],
                      }
                    : { create: [entity] }
                )
              );
              const operation = res[0] as EntityObjectOperationResult;
              const { id } = operation.railjson;
              setIsLoading(false);

              const savedEntity =
                id && id !== entity.properties.id
                  ? {
                      ...entity,
                      properties: { ...entity.properties, id: `${id}` },
                    }
                  : entity;
              setState({
                entity: cloneDeep(savedEntity),
                initialEntity: cloneDeep(savedEntity),
              });
            } catch (e: unknown) {
              setIsLoading(false);
            }
          }}
        >
          <AiFillSave className="mr-2" />
          {isNew
            ? t('Editor.tools.speed-edition.save-new-speed-section')
            : t('Editor.tools.speed-edition.save-existing-speed-section')}
        </button>
      </div>
      <MetadataForm />
      <hr />
      <TrackRangesList />
    </div>
  );
};

export const SpeedSectionEditionLayers: FC = () => {
  const { t } = useTranslation();
  const {
    renderingFingerprint,
    state: { entity, trackSectionsCache, hoveredItem, interactionState, mousePosition },
    setState,
  } = useContext(EditorContext) as ExtendedEditorContextType<SpeedSectionEditionState>;
  const { mapStyle, layersSettings, showIGNBDORTHO } = useSelector(getMap);
  const infraId = useSelector(getInfraID);
  const selection = useMemo(() => {
    // Dragging an extremity:
    if (interactionState.type === 'movePoint')
      return [(entity.properties.track_ranges || [])[interactionState.rangeIndex].track];

    // Custom hovered element:
    if (hoveredItem?.speedSectionItemType) return [hoveredItem.track.properties.id];

    // EditorEntity hovered element:
    if (
      hoveredItem?.type === 'TrackSection' &&
      !(entity.properties.track_ranges || []).find((range) => range.track === hoveredItem.id)
    )
      return [hoveredItem.id];

    return undefined;
  }, [interactionState, hoveredItem, entity]);

  const speedSectionsFeature: FeatureCollection = useMemo(() => {
    const flatEntity = flattenEntity(entity);
    const trackRanges = entity.properties?.track_ranges || [];
    return featureCollection(
      trackRanges.flatMap((range, i) => {
        const trackState = trackSectionsCache[range.track];
        return trackState?.type === 'success'
          ? getTrackRangeFeatures(trackState.track, range, i, flatEntity.properties)
          : [];
      }) as Feature<LineString | Point>[]
    );
  }, [entity, trackSectionsCache]);
  const layersProps = useMemo(
    () =>
      SourcesDefinitionsIndex.speed_sections(
        {
          sourceLayer: 'geo',
          prefix: mapStyle === 'blueprint' ? 'SCHB ' : '',
          colors: colors[mapStyle],
          signalsList: [],
          symbolsList: [],
          isEmphasized: true,
          showIGNBDORTHO,
          layersSettings,
        },
        'speedSectionsEditor/'
      ),
    [mapStyle, showIGNBDORTHO, layersSettings]
  );

  const layers = useMemo(() => new Set(['track_sections']) as Set<LayerType>, []);

  // Here is where we handle loading the TrackSections attached to the speed section:
  useEffect(() => {
    const trackIDs = entity.properties?.track_ranges?.map((range) => range.track) || [];
    const missingTrackIDs = trackIDs.filter((id) => !trackSectionsCache[id]);

    if (missingTrackIDs.length) {
      setState((s) => ({
        ...s,
        trackSectionsCache: missingTrackIDs.reduce(
          (iter, id) => ({ ...iter, [id]: { type: 'loading' } }),
          s.trackSectionsCache
        ),
      }));

      getEntities<TrackSectionEntity>(infraId as number, missingTrackIDs, 'TrackSection').then(
        (res) => {
          setState((s) => ({
            ...s,
            trackSectionsCache: {
              ...s.trackSectionsCache,
              ...mapValues(res, (track) => ({ type: 'success', track } as TrackState)),
            },
          }));
        }
      );
    }
  }, [entity.properties?.track_ranges]);

  return (
    <>
      <GeoJSONs
        colors={colors[mapStyle]}
        layers={layers}
        selection={selection}
        fingerprint={renderingFingerprint}
        layersSettings={layersSettings}
        isEmphasized={false}
        beforeId={layersProps[0].id}
      />
      <Source type="geojson" data={speedSectionsFeature}>
        {layersProps.map((props, i) => (
          <Layer {...props} key={i} />
        ))}
        <Layer
          type="circle"
          paint={{
            'circle-radius': 4,
            'circle-color': '#fff',
            'circle-stroke-color': '#000000',
            'circle-stroke-width': 2,
          }}
          filter={['has', 'extremity']}
        />
      </Source>
      {hoveredItem?.speedSectionItemType === 'TrackRangeExtremity' && (
        <Popup
          className="popup"
          anchor="bottom"
          longitude={hoveredItem.position[0]}
          latitude={hoveredItem.position[1]}
          closeButton={false}
        >
          <div>{t('Editor.tools.speed-edition.move-range-extremity')}</div>
          <EntitySumUp entity={hoveredItem.track} />
        </Popup>
      )}
      {hoveredItem?.speedSectionItemType === 'TrackRange' && (
        <Popup
          className="popup"
          anchor="bottom"
          longitude={hoveredItem.position[0]}
          latitude={hoveredItem.position[1]}
          closeButton={false}
        >
          <div>{t('Editor.tools.speed-edition.remove-track-range')}</div>
          <EntitySumUp entity={hoveredItem.track} />
        </Popup>
      )}
      {interactionState.type !== 'movePoint' &&
        hoveredItem?.type === 'TrackSection' &&
        !(entity.properties.track_ranges || []).find((range) => range.track === hoveredItem.id) &&
        mousePosition && (
          <Popup
            className="popup"
            anchor="bottom"
            longitude={mousePosition[0]}
            latitude={mousePosition[1]}
            closeButton={false}
          >
            <div>{t('Editor.tools.speed-edition.add-track-range')}</div>
            <EntitySumUp id={hoveredItem.id} objType={hoveredItem.type} />
          </Popup>
        )}
    </>
  );
};

export const SpeedSectionMessages: FC = () => null;
// export const SpeedSectionMessages: FC = () => {
//   const { t } = useTranslation();
//   const {
//     state: {
//       /* TODO */
//     },
//   } = useContext(EditorContext) as ExtendedEditorContextType<SpeedSectionEditionState>;
//   return null;
// };