import { describe, expect, it } from 'vitest';

import { CLOCK_START } from './clock';
import { setupWorld } from './index';

const world = setupWorld();

describe('the world clock', () => {
  it('moves only when a test moves it', () => {
    expect(world.clock.now()).toEqual(CLOCK_START);
    world.clock.advance(60_000);
    expect(world.clock.now()).toEqual(new Date(CLOCK_START.getTime() + 60_000));
  });

  it('is back at its start in the next test', () => {
    expect(world.clock.now()).toEqual(CLOCK_START);
    world.clock.set(new Date('2027-01-01T00:00:00Z'));
  });

  it('is back at its start after a set as well', () => {
    expect(world.clock.now()).toEqual(CLOCK_START);
  });
});
