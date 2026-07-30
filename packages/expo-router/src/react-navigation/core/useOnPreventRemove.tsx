'use client';
import * as React from 'react';
import { use } from 'react';

import type { NavigationAction, NavigationState } from '../routers';
import {
  type ChildBeforeRemoveListener,
  type ChildPreventRemoveListener,
  NavigationBuilderContext,
} from './NavigationBuilderContext';
import { NavigationRouteContext } from './NavigationProvider';
import type { IsRoutePrevented } from './PreventRemoveProvider';
import type { EventMapCore } from './types';
import type { NavigationEventEmitter } from './useEventEmitter';

type Options = {
  getState: () => NavigationState;
  isRoutePrevented: IsRoutePrevented;
  emitter: NavigationEventEmitter<EventMapCore<any>>;
  preventRemoveListeners: Record<string, ChildPreventRemoveListener | undefined>;
  beforeRemoveListeners: Record<string, ChildBeforeRemoveListener | undefined>;
};

const VISITED_ROUTE_KEYS = Symbol('VISITED_ROUTE_KEYS');

export const getPreventableRoutes = (
  state: NavigationState | { type?: string; index?: number; routes: { key?: string }[] },
  type = state.type
) =>
  type === 'stack'
    ? state.routes.slice(0, (state.index ?? state.routes.length - 1) + 1)
    : state.routes;

const getRemovedRoutes = (currentRoutes: { key?: string }[], nextRoutes: { key?: string }[]) => {
  const nextRouteKeys = nextRoutes.map((route) => route.key);

  return currentRoutes
    .filter(
      (route): route is { key: string } =>
        route.key !== undefined && !nextRouteKeys.includes(route.key)
    )
    .reverse();
};

export const shouldPreventRemove = (
  emitter: NavigationEventEmitter<EventMapCore<any>>,
  preventRemoveListeners: Record<string, ChildPreventRemoveListener | undefined>,
  isRoutePrevented: IsRoutePrevented,
  currentRoutes: { key?: string }[],
  nextRoutes: { key?: string }[],
  action: NavigationAction
) => {
  for (const route of getRemovedRoutes(currentRoutes, nextRoutes)) {
    if (preventRemoveListeners[route.key]?.(action)) {
      return true;
    }

    if (isRoutePrevented(route.key)) {
      emitter.emit({
        type: 'removePrevented',
        target: route.key,
        data: { action },
      });
      return true;
    }
  }

  return false;
};

export const emitBeforeRemove = (
  emitter: NavigationEventEmitter<EventMapCore<any>>,
  beforeRemoveListeners: Record<string, ChildBeforeRemoveListener | undefined>,
  currentRoutes: { key?: string }[],
  nextRoutes: { key?: string }[],
  action: NavigationAction
) => {
  const visitedRouteKeys: Set<string> =
    // @ts-expect-error: add this property to mark that we've already emitted this action
    action[VISITED_ROUTE_KEYS] ?? new Set<string>();
  const beforeRemoveAction = { ...action, [VISITED_ROUTE_KEYS]: visitedRouteKeys };

  for (const route of getRemovedRoutes(currentRoutes, nextRoutes)) {
    if (visitedRouteKeys.has(route.key)) {
      continue;
    }

    beforeRemoveListeners[route.key]?.(beforeRemoveAction);
    visitedRouteKeys.add(route.key);
    emitter.emit({
      type: 'beforeRemove',
      target: route.key,
      data: { action: beforeRemoveAction },
    });
  }
};

export function useOnPreventRemove({
  getState,
  isRoutePrevented,
  emitter,
  preventRemoveListeners,
  beforeRemoveListeners,
}: Options) {
  const { addKeyedListener } = use(NavigationBuilderContext);
  const routeKey = use(NavigationRouteContext)?.key;

  React.useEffect(() => {
    if (!routeKey) {
      return;
    }

    return addKeyedListener?.('preventRemove', routeKey, (action) => {
      const state = getState();
      return shouldPreventRemove(
        emitter,
        preventRemoveListeners,
        isRoutePrevented,
        getPreventableRoutes(state),
        [],
        action
      );
    });
  }, [addKeyedListener, emitter, getState, isRoutePrevented, preventRemoveListeners, routeKey]);

  React.useEffect(() => {
    if (!routeKey) {
      return;
    }

    return addKeyedListener?.('beforeRemove', routeKey, (action) => {
      const state = getState();
      emitBeforeRemove(emitter, beforeRemoveListeners, getPreventableRoutes(state), [], action);
    });
  }, [addKeyedListener, beforeRemoveListeners, emitter, getState, routeKey]);
}
