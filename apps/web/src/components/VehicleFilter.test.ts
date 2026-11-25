import { describe, expect, it } from 'vitest';
import { describeChoice } from './VehicleFilter';

describe('what the vehicle filter says it is showing', () => {
  it('reads as the trade says it, whatever is picked', () => {
    expect(describeChoice({ sizes: ['artic', 'rigid'], types: ['refrigerated'] })).toBe(
      'an artic or rigid with a refrigerated body'
    );
    expect(describeChoice({ sizes: ['van'], types: [] })).toBe('a van');
    expect(describeChoice({ sizes: [], types: ['box', 'tanker'] })).toBe('a box or tanker body');
    expect(describeChoice({ sizes: ['rigid'], types: ['low_loader'] })).toBe('a rigid with a low loader body');
  });
});
