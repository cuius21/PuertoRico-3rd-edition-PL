import { describe, it, expect } from 'vitest';
import { NEURAL_INPUT_SIZE } from '../../src/bots/neural/features';
import type { PolicyExample } from '../../src/bots/neural/policyFeatures';
import { sharpenPolicyTarget, resolvePolicyTargetTemperature, policyTrainingTargets, measurePolicy } from '../../tools/train-policy';

describe('teacher visit target temperature', () => {
  it('normalizes squared visits after splitting without mutating original targets or metric references', () => {
    const target = [0.6, 0.3, 0.1, 0];
    const original = [...target];
    const sample: PolicyExample = { input: new Array<number>(NEURAL_INPUT_SIZE).fill(0),
      actionIds: [0, 1, 2, 3], baseline: [0.1, 0.7, 0.1, 0.1], target, phase: 'roleSelection',
      mover: 0, teacherIterations: 10, teacherValues: [0.2, 0.3, 0.2, 0.1] };
    const before = measurePolicy(null, [sample]);
    const transformed = policyTrainingTargets([sample], 0.5);
    expect(transformed[0]).not.toBe(sample);
    expect(transformed[0]!.target[0]).toBeCloseTo(0.36 / 0.46, 12);
    expect(transformed[0]!.target[1]).toBeCloseTo(0.09 / 0.46, 12);
    expect(transformed[0]!.target[2]).toBeCloseTo(0.01 / 0.46, 12);
    expect(transformed[0]!.target[3]).toBe(0);
    expect(transformed[0]!.target.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(target).toEqual(original);
    expect(measurePolicy(null, [sample])).toEqual(before);
    expect(measurePolicy(null, transformed).crossEntropy).not.toBeCloseTo(before.crossEntropy, 6);
    expect(measurePolicy(null, transformed).top1Accuracy).toBe(before.top1Accuracy);
    expect(sharpenPolicyTarget([0.5, 0.5, 0], 0.05)).toEqual([0.5, 0.5, 0]);
    const legacy = sharpenPolicyTarget(target, 1);
    expect(legacy).toEqual(target);
    expect(legacy).not.toBe(target);
    legacy[0] = 0;
    expect(target).toEqual(original);
    expect(sharpenPolicyTarget([1 - 1e-9, 1e-9], 0.05).every(Number.isFinite)).toBe(true);
    expect(sharpenPolicyTarget(target, 10).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('rejects nonfinite, out-of-range temperatures and malformed teacher distributions', () => {
    for (const temperature of [0, -1, NaN, Infinity, 0.049, 10.01]) {
      expect(() => sharpenPolicyTarget([0.6, 0.4], temperature)).toThrow('temperature');
      expect(() => resolvePolicyTargetTemperature(temperature)).toThrow('temperature');
    }
    for (const target of [[], [0, 0], [0.6, 0.6], [-0.1, 1.1], [NaN, 1]]) {
      expect(() => sharpenPolicyTarget(target, 0.5)).toThrow();
    }
  });

  it('inherits resumed objective, treats old checkpoints as temperature 1 and rejects objective changes', () => {
    expect(resolvePolicyTargetTemperature()).toBe(1);
    expect(resolvePolicyTargetTemperature(0.5)).toBe(0.5);
    expect(resolvePolicyTargetTemperature(undefined, {})).toBe(1);
    expect(resolvePolicyTargetTemperature(1, {})).toBe(1);
    expect(resolvePolicyTargetTemperature(undefined, { targetTemperature: 0.5 })).toBe(0.5);
    expect(resolvePolicyTargetTemperature(0.5, { targetTemperature: 0.5 })).toBe(0.5);
    expect(() => resolvePolicyTargetTemperature(1, { targetTemperature: 0.5 })).toThrow('Cannot change');
    expect(() => resolvePolicyTargetTemperature(0.5, {})).toThrow('Cannot change');
    for (const targetTemperature of [null, '0.5', NaN, 0, Infinity]) {
      expect(() => resolvePolicyTargetTemperature(undefined, { targetTemperature })).toThrow('temperature');
    }
  });
});
