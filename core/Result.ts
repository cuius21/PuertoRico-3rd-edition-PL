// Prosty typ Result do walidacji akcji.
// Wybrałem nad rzucaniem wyjątkami - akcja może "legalnie nie przejść"
// i UI powinno to widzieć jako wartość, nie jako wyjątek.

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Singleton dla akcji bez wartości zwracanej.
export const OkVoid: Result<void, never> = { ok: true, value: undefined };
