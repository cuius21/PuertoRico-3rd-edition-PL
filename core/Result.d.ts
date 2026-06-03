export type Result<T, E = string> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: E;
};
export declare const Ok: <T>(value: T) => Result<T, never>;
export declare const Err: <E>(error: E) => Result<never, E>;
export declare const OkVoid: Result<void, never>;
//# sourceMappingURL=Result.d.ts.map