import { act, render } from '@testing-library/react-native';
import * as React from 'react';

import { type ParamListBase, StackActions, StackRouter } from '../../routers';
import { BaseNavigationContainer } from '../BaseNavigationContainer';
import { Screen } from '../Screen';
import { createNavigationContainerRef } from '../createNavigationContainerRef';
import { useNavigationBuilder } from '../useNavigationBuilder';
import { usePreventRemove } from '../usePreventRemove';

jest.mock('nanoid/non-secure', () => {
  const m = { nanoid: () => String(++m.__key), __key: 0 };
  return m;
});

beforeEach(() => {
  require('nanoid/non-secure').__key = 0;
});

test('blocks removal with the hook and emits removePrevented', () => {
  const TestNavigator = (props: any) => {
    const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, props);
    return (
      <NavigationContent>
        {state.routes.map((route) => descriptors[route.key]!.render())}
      </NavigationContent>
    );
  };
  const removePrevented = jest.fn();
  const beforeRemove = jest.fn();
  let setPreventRemove: React.Dispatch<React.SetStateAction<boolean>>;

  const TestScreen = ({ navigation }: any) => {
    const [preventRemove, setPreventRemoveState] = React.useState(true);
    setPreventRemove = setPreventRemoveState;
    usePreventRemove(preventRemove, removePrevented);
    React.useEffect(() => navigation.addListener('removePrevented', removePrevented), [navigation]);
    React.useEffect(() => navigation.addListener('beforeRemove', beforeRemove), [navigation]);
    return null;
  };

  const ref = createNavigationContainerRef<ParamListBase>();
  render(
    <BaseNavigationContainer ref={ref}>
      <TestNavigator initialRouteName="foo">
        <Screen name="foo">{() => null}</Screen>
        <Screen name="bar" component={TestScreen} />
      </TestNavigator>
    </BaseNavigationContainer>
  );

  act(() => ref.current?.navigate('bar'));
  const action = StackActions.pop();
  act(() => ref.current?.dispatch(action));

  expect(ref.current?.getRootState().routes.map((route) => route.name)).toEqual(['foo', 'bar']);
  expect(removePrevented).toHaveBeenCalledTimes(2);
  expect(removePrevented.mock.calls[0][0].data.action).toBe(action);
  expect(removePrevented.mock.calls[1][0].data.action).toBe(action);
  expect(beforeRemove).not.toHaveBeenCalled();

  act(() => setPreventRemove(false));
  act(() => ref.current?.goBack());

  expect(ref.current?.getRootState().routes.map((route) => route.name)).toEqual(['foo']);
  expect(beforeRemove).toHaveBeenCalledTimes(1);
  expect(() => beforeRemove.mock.calls[0][0].preventDefault()).toThrow(TypeError);
});
