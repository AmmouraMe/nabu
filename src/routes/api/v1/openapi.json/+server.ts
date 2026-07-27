import type { RequestHandler } from './$types';
import {
	V1_ENDPOINTS,
	ERROR_CODES,
	ALL_SCOPES,
	LOGO_STYLES,
	API_BASE_URL,
	API_VERSION
} from '$lib/api-spec';

/**
 * GET /api/v1/openapi.json
 *
 * OpenAPI 3.1 generated from the same `api-spec` the docs page renders, so generated
 * clients, Postman imports and the human docs can never describe different APIs.
 *
 * Public and unauthenticated on purpose: a description of the surface is not
 * sensitive, and requiring a key to discover how to use keys is a poor first
 * experience.
 */
export const GET: RequestHandler = async () => {
	const paths: Record<string, Record<string, unknown>> = {};

	for (const endpoint of V1_ENDPOINTS) {
		// SvelteKit writes params as [id]; OpenAPI wants {id}.
		const openApiPath = endpoint.path.replace(/\[([^\]]+)\]/g, '{$1}');
		const params = [...endpoint.path.matchAll(/\[([^\]]+)\]/g)].map((m) => ({
			name: m[1],
			in: 'path',
			required: true,
			schema: { type: 'string' }
		}));

		const operation: Record<string, unknown> = {
			summary: endpoint.summary,
			description: endpoint.description,
			security: [{ bearerAuth: [] }],
			...(endpoint.scope ? { 'x-required-scope': endpoint.scope } : {}),
			...(params.length ? { parameters: params } : {}),
			responses: {
				'200': { description: endpoint.returns },
				'401': { description: 'Missing or invalid API key.' },
				'403': { description: 'Key lacks the required scope, or role cannot write.' },
				'404': { description: 'Not found, or not reachable by this key.' }
			}
		};

		if (endpoint.body?.length) {
			const properties: Record<string, unknown> = {};
			const required: string[] = [];
			for (const field of endpoint.body) {
				properties[field.name] = {
					type: field.type === 'string[]' ? 'array' : field.type === 'enum' ? 'string' : field.type,
					description: field.description,
					...(field.type === 'string[]' ? { items: { type: 'string' } } : {}),
					...(field.name === 'style' ? { enum: LOGO_STYLES } : {}),
					...(field.default ? { default: field.default } : {})
				};
				if (field.required) required.push(field.name);
			}
			operation.requestBody = {
				required: endpoint.body.some((f) => f.required),
				content: {
					'application/json': {
						schema: { type: 'object', properties, ...(required.length ? { required } : {}) }
					}
				}
			};
		}

		paths[openApiPath] ??= {};
		paths[openApiPath][endpoint.method.toLowerCase()] = operation;
	}

	const document = {
		openapi: '3.1.0',
		info: {
			title: 'Nabu API',
			version: API_VERSION,
			description:
				'Manage brands and generate assets programmatically. Generated from the running API definitions.'
		},
		servers: [{ url: API_BASE_URL }],
		components: {
			securitySchemes: {
				bearerAuth: { type: 'http', scheme: 'bearer', description: 'An API key: nabu_sk_…' }
			},
			schemas: {
				Error: {
					type: 'object',
					properties: {
						error: {
							type: 'object',
							properties: {
								code: { type: 'string', enum: [...new Set(ERROR_CODES.map((e) => e.code))] },
								message: { type: 'string' }
							}
						}
					}
				}
			}
		},
		'x-scopes': ALL_SCOPES,
		paths
	};

	return new Response(JSON.stringify(document, null, 2), {
		headers: {
			'content-type': 'application/json',
			// Cheap to regenerate, but it changes only on deploy.
			'cache-control': 'public, max-age=300'
		}
	});
};
