import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Comment from './Comment';
import KeepAliveContext from '../contexts/KeepAliveContext';
import createEventEmitter from '../utils/createEventEmitter';
import createUniqueIdentification from '../utils/createUniqueIdentification';
import createStoreElement from '../utils/createStoreElement';

export const keepAliveProviderTypeName = '$$KeepAliveProvider';
export const START_MOUNTING_DOM = 'startMountingDOM';

export enum LIFECYCLE {
  MOUNTED,
  UPDATING,
  UNMOUNTED,
}

export interface ICacheItem {
  children: React.ReactNode;
  keepAlive: boolean;
  lifecycle: LIFECYCLE;
  renderElement?: HTMLElement;
  activated?: boolean;
  ifStillActivate?: boolean;
  reactivate?: () => void;
}

export interface ICache {
  [key: string]: ICacheItem;
}

export interface IKeepAliveProviderImpl {
  storeElement: HTMLElement;
  cache: ICache;
  keys: string[];
  eventEmitter: any;
  existed: boolean;
  providerIdentification: string;
  setCache: (identification: string, value: ICacheItem) => void;
  removeCache: (name: string) => void;
  unactivate: (identification: string) => void;
  isExisted: () => boolean;
}

export interface IKeepAliveProviderProps {
  include?: string | string[] | RegExp;
  exclude?: string | string[] | RegExp;
  max?: number;
}

export default class KeepAliveProvider extends React.PureComponent<IKeepAliveProviderProps> implements IKeepAliveProviderImpl {
  public static displayName = keepAliveProviderTypeName;

  public static defaultProps = {
    max: 10,
  };

  public storeElement: HTMLElement;

  // Sometimes data that changes with setState cannot be synchronized, so force refresh
  public cache: ICache = Object.create(null);

  public keys: string[] = [];

  public eventEmitter = createEventEmitter();

  public existed: boolean = true;

  private needRerender: boolean = false;

  public providerIdentification: string = createUniqueIdentification();

  public componentDidMount() {
    this.storeElement = createStoreElement();
    this.forceUpdate();
  }

  public componentDidUpdate() {
    if (this.needRerender) {
      this.needRerender = false;
      this.forceUpdate();
    }
  }

  public componentWillUnmount() {
    this.existed = false;
    document.body.removeChild(this.storeElement);
  }

  public isExisted = () => {
    return this.existed;
  }

  public setCache = (identification: string, value: ICacheItem) => {
    const {cache, keys} = this;
    const {max} = this.props;
    const currentCache = cache[identification];
    if (!currentCache) {
      keys.push(identification);
    }
    this.cache[identification] = {
      ...currentCache,
      ...value,
    };
    for (const key in cache) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) {
        if (keys.indexOf(key) === -1) {
          delete cache[key];
        }
      }
    }
    this.forceUpdate(() => {
      // If the maximum value is set, the value in the cache is deleted after it goes out.
      if (currentCache) {
        return;
      }
      if (!max) {
        return;
      }
      const difference = keys.length - (max as number);
      if (difference <= 0) {
        return;
      }
      const spliceKeys = keys.splice(0, difference);
      this.forceUpdate(() => {
        spliceKeys.forEach(key => {
          delete cache[key as string];
        });
      });
    });
  }

  public removeCache = (name: string | string[]) => {
    const {cache, keys} = this;
    const needDeletedCacheKeys: any = [];
    for (const key in cache) {
      if (Object.prototype.hasOwnProperty.call(cache, key)) {
        const keepAliveObject = cache[key] as any;
        // if name is array, mutiple delete caches
        if (Object.prototype.toString.call(name) === '[object Array]') {
          if (name.indexOf(keepAliveObject.children._owner.key) > -1 ) {
            needDeletedCacheKeys.push(key);
            delete cache[key as string];
          }
        } else if (Object.prototype.toString.call(name) === '[object String]') {
          if (name === keepAliveObject.children._owner.key) {
            needDeletedCacheKeys.push(key);
            delete cache[key as string];
          }
        } else {
          throw new Error("name can be only string or string array");
        }
      }
    }
    this.keys = keys.filter((key) => needDeletedCacheKeys.indexOf(key) === -1)
    this.forceUpdate();
  }

  public unactivate = (identification: string) => {
    const {cache} = this;
    this.cache[identification] = {
      ...cache[identification],
      activated: false,
      lifecycle: LIFECYCLE.UNMOUNTED,
    };
    this.forceUpdate();
  }

  private startMountingDOM = (identification: string) => {
    this.eventEmitter.emit([identification, START_MOUNTING_DOM]);
  }

  public render() {
    const {
      cache,
      keys,
      providerIdentification,
      isExisted,
      setCache,
      removeCache,
      existed,
      unactivate,
      storeElement,
      eventEmitter,
    } = this;
    const {
      children: innerChildren,
      include,
      exclude,
    } = this.props;
    if (!storeElement) {
      return null;
    }
    return (
      <KeepAliveContext.Provider
        value={{
          cache,
          keys,
          existed,
          providerIdentification,
          isExisted,
          setCache,
          removeCache,
          unactivate,
          storeElement,
          eventEmitter,
          include,
          exclude,
        }}
      >
        <React.Fragment>
          {innerChildren}
          {ReactDOM.createPortal(
            keys.map(identification => {
              const currentCache = cache[identification];
              const {
                keepAlive,
                children,
                lifecycle,
              } = currentCache;
              let cacheChildren = children;
              if (lifecycle === LIFECYCLE.MOUNTED && !keepAlive) {
                // If the cache was last enabled, then the components of this keepAlive package are used,
                // and the cache is not enabled, the UI needs to be reset.
                cacheChildren = null;
                this.needRerender = true;
                currentCache.lifecycle = LIFECYCLE.UPDATING;
              }
              // current true, previous true | undefined, keepAlive false, not cache
              // current true, previous true | undefined, keepAlive true, cache

              // current true, previous false, keepAlive true, cache
              // current true, previous false, keepAlive false, not cache
              return (
                cacheChildren
                  ? (
                    <React.Fragment key={identification}>
                      <Comment>{identification}</Comment>
                      {cacheChildren}
                      <Comment
                        onLoaded={() => this.startMountingDOM(identification)}
                      >{identification}</Comment>
                    </React.Fragment>
                  )
                  : null
              );
            }),
            storeElement
          )}
        </React.Fragment>
      </KeepAliveContext.Provider>
    );
  }
}
