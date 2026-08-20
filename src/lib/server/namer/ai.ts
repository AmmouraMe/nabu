/**
 * The Workers AI call behind the name generator.
 *
 * Lives here rather than in the route because SvelteKit allows only HTTP verbs
 * and a short reserved list to be exported from a `+server.ts` — anything else
 * makes the whole route throw at request time, which unit tests importing the
 * symbol directly will never notice.
 */

/** The same free-tier model the content generator uses. */
export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * Six names with five prose fields each runs past 1,400 tokens and truncates
 * mid-array, which cost a production 502 once. `parseNames` also salvages a
 * truncated reply, so an overrun now costs the last name rather than all six.
 */
export const MAX_TOKENS = 2600;

/** Naming wants range; a low temperature returns six variations on one idea. */
export const TEMPERATURE = 0.9;

export type AiResult =
	| string
	| { response?: string; choices?: { message?: { content?: string } }[] };

/**
 * Pull the generated text out of whatever shape the binding returned.
 *
 * llama-3.3-70b answers through the Workers AI binding with an OpenAI-style
 * `{ choices: [{ message: { content } }] }`, not the `{ response }` older models
 * use. Reading only `.response` yields an empty string on every call — a silent
 * failure that reads as the model refusing. All three shapes are accepted, so a
 * model that changes its envelope degrades to a visible 502 rather than doing so
 * quietly and permanently.
 */
export function responseText(result: AiResult): string {
	if (typeof result === 'string') return result;
	if (typeof result?.response === 'string') return result.response;
	const content = result?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : '';
}
