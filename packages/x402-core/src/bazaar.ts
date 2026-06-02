/**
 * @dexterai/x402-core — Bazaar-extension schema extractor
 *
 * ONE canonical, COMPLETE parser for the x402 `extensions.bazaar` shape,
 * shared by both `x402_check` (check.ts, this package) and the dexter-api
 * verifier input pipeline.
 *
 * The pre-existing parsers (verifier `extractBazaarBodyHints`, check.ts's
 * `accepts[0].outputSchema` lookup) read only HALF the bazaar shape — the
 * POST/PUT `info.input.body` + `schema...input.body` — and silently DROP the
 * GET `info.input.queryParams` + `schema...input.queryParams` half. That left
 * GET-with-schema sellers (params live in queryParams) tested with URL-guessed
 * params, and agents calling x402_check on bazaar sellers got `null` schemas.
 *
 * This reads the FULL shape:
 *
 *   extensions.bazaar.info.input.body          → POST/PUT body example
 *   extensions.bazaar.info.input.queryParams   → GET query example
 *   extensions.bazaar.info.input.method        → HTTP method
 *   extensions.bazaar.info.output.example      → output example
 *   extensions.bazaar.schema.properties.input.properties.body.properties        → body field shapes
 *   extensions.bazaar.schema.properties.input.properties.queryParams.properties → query field shapes
 *   extensions.bazaar.schema.properties.output                                  → output shape
 *
 * Fully defensive: every nested access is guarded and ANY malformed/missing
 * input returns the all-null object — it never throws (mirrors the verifier's
 * `extractBazaarBodyHints` try/catch contract).
 */

export interface BazaarSchema {
  /**
   * info.input.body — the POST/PUT request body example. Usually an object,
   * but some endpoints want an ARRAY body (`[{...}]` not `{...}`); both are
   * preserved here. Use {@link BazaarSchema.expectsArray} to tell them apart.
   */
  inputBody: Record<string, unknown> | unknown[] | null;
  /**
   * True when `info.input.body` is an ARRAY (the endpoint expects `[{...}]`
   * rather than `{...}`). Consumers wrap a normalized body in an array when
   * this is set (verifier payment.ts). `false` for object/absent bodies.
   */
  expectsArray: boolean;
  /** info.input.queryParams — the GET query-string example. */
  inputQueryParams: Record<string, unknown> | null;
  /** info.input.method — uppercased + validated (GET/POST/PUT/PATCH/DELETE), else null. */
  inputMethod: string | null;
  /** info.output.example — the example response payload. */
  outputExample: unknown | null;
  /** schema.properties.input.properties.body.properties — per-field body shapes. */
  bodyFieldShapes: Record<string, unknown> | null;
  /** schema.properties.input.properties.queryParams.properties — per-field query shapes. */
  queryParamShapes: Record<string, unknown> | null;
  /** schema.properties.output — the published output shape. */
  outputShape: unknown | null;
  /**
   * Convenience: the input schema object an agent needs to know "what should I
   * send". Prefers the published `schema.properties.input` if present; else
   * synthesized from `info.input` (queryParams for GET / when only queryParams
   * exist, otherwise body).
   */
  inputSchema: unknown | null;
  /** Convenience: `schema.properties.output` ?? `info.output` ?? null. */
  outputSchema: unknown | null;
}

const NULL_SCHEMA: BazaarSchema = {
  inputBody: null,
  expectsArray: false,
  inputQueryParams: null,
  inputMethod: null,
  outputExample: null,
  bodyFieldShapes: null,
  queryParamShapes: null,
  outputShape: null,
  inputSchema: null,
  outputSchema: null,
};

/** True for a non-null, non-array plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Parse the FULL x402 bazaar extension into a normalized {@link BazaarSchema}.
 *
 * @param extensions the `extensions` object off a 402 challenge (body or the
 *   decoded PAYMENT-REQUIRED header). Anything malformed / missing yields the
 *   all-null object.
 */
export function extractBazaarSchema(extensions: unknown): BazaarSchema {
  if (!isObject(extensions)) return { ...NULL_SCHEMA };

  try {
    const bazaar = extensions.bazaar;
    if (!isObject(bazaar)) return { ...NULL_SCHEMA };

    // ---- info.* (concrete examples) -------------------------------------
    const info = isObject(bazaar.info) ? bazaar.info : undefined;
    const infoInput = info && isObject(info.input) ? info.input : undefined;
    const infoOutput = info && isObject(info.output) ? info.output : undefined;

    // info.input.body is the ONE leaf where an ARRAY is a legitimate value
    // (some endpoints want `[{...}]`). Accept object OR array; treat a
    // missing/primitive body as null. Do NOT loosen the structural guards on
    // any other level — only this concrete body example may be an array.
    let inputBody: Record<string, unknown> | unknown[] | null = null;
    let expectsArray = false;
    const rawBody = infoInput ? infoInput.body : undefined;
    if (Array.isArray(rawBody)) {
      inputBody = rawBody;
      expectsArray = true;
    } else if (isObject(rawBody)) {
      inputBody = rawBody;
    }

    const inputQueryParams =
      infoInput && isObject(infoInput.queryParams) ? infoInput.queryParams : null;

    let inputMethod: string | null = null;
    const rawMethod = infoInput?.method;
    if (typeof rawMethod === 'string') {
      const m = rawMethod.trim().toUpperCase();
      if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) inputMethod = m;
    }

    const outputExample =
      infoOutput && 'example' in infoOutput ? infoOutput.example : null;

    // ---- schema.* (published field shapes) ------------------------------
    const schema = isObject(bazaar.schema) ? bazaar.schema : undefined;
    const schemaProps =
      schema && isObject(schema.properties) ? schema.properties : undefined;

    // schema.properties.input (the whole published input object — used as the
    // first-choice for the inputSchema convenience field).
    const publishedInput =
      schemaProps && isObject(schemaProps.input) ? schemaProps.input : undefined;

    // schema.properties.input.properties.{body,queryParams}.properties
    const publishedInputProps =
      publishedInput && isObject(publishedInput.properties)
        ? publishedInput.properties
        : undefined;

    let bodyFieldShapes: Record<string, unknown> | null = null;
    if (publishedInputProps && isObject(publishedInputProps.body)) {
      const bodyProps = (publishedInputProps.body as Record<string, unknown>)
        .properties;
      bodyFieldShapes = isObject(bodyProps) ? bodyProps : null;
    }

    let queryParamShapes: Record<string, unknown> | null = null;
    if (publishedInputProps && isObject(publishedInputProps.queryParams)) {
      const qpProps = (publishedInputProps.queryParams as Record<string, unknown>)
        .properties;
      queryParamShapes = isObject(qpProps) ? qpProps : null;
    }

    // schema.properties.output — the published output shape.
    const outputShape =
      schemaProps && 'output' in schemaProps ? schemaProps.output : null;

    // ---- inputSchema convenience ----------------------------------------
    // Prefer the published input schema object outright. Else synthesize the
    // most useful "what should the caller send" object from info.input:
    //   - GET (or when only queryParams exist) → the queryParams example
    //   - otherwise → the body example
    let inputSchema: unknown | null = null;
    if (publishedInput !== undefined) {
      inputSchema = publishedInput;
    } else {
      const isGet = inputMethod === 'GET';
      const onlyQuery = inputQueryParams != null && inputBody == null;
      if ((isGet || onlyQuery) && inputQueryParams != null) {
        inputSchema = inputQueryParams;
      } else if (inputBody != null) {
        // inputBody may be an array (expectsArray) — surface it as-is, which
        // is exactly the example a caller needs ("send `[{...}]`").
        inputSchema = inputBody;
      } else if (inputQueryParams != null) {
        // No method signal and no body — queryParams is all we have.
        inputSchema = inputQueryParams;
      } else {
        inputSchema = null;
      }
    }

    // ---- outputSchema convenience ---------------------------------------
    // schema.properties.output ?? info.output ?? null
    let outputSchema: unknown | null = null;
    if (outputShape != null) {
      outputSchema = outputShape;
    } else if (infoOutput !== undefined) {
      outputSchema = infoOutput;
    } else {
      outputSchema = null;
    }

    return {
      inputBody,
      expectsArray,
      inputQueryParams,
      inputMethod,
      outputExample,
      bodyFieldShapes,
      queryParamShapes,
      outputShape,
      inputSchema,
      outputSchema,
    };
  } catch {
    return { ...NULL_SCHEMA };
  }
}
