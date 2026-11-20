import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { applyDecorators } from '@nestjs/common';
import { z, type ZodType } from 'zod';

/** Validates and transforms a request part with a shared Zod schema. */
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

export const zodPipe = <T extends ZodType>(schema: T) => new ZodPipe(schema);

/** Converts a Zod schema to an OpenAPI schema object for Swagger. */
export function toOpenApi(schema: ZodType): Record<string, any> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, any>;
  delete json.$schema;
  return json;
}

/** Documents a JSON body in Swagger from the same Zod schema used for validation. */
export const ApiZodBody = (schema: ZodType) => ApiBody({ schema: toOpenApi(schema) });

/** Documents query parameters in Swagger from a Zod object schema. */
export function ApiZodQuery(schema: ZodType) {
  const json = toOpenApi(schema);
  const props = (json.properties ?? {}) as Record<string, any>;
  return applyDecorators(
    ...Object.entries(props).map(([name, s]) =>
      ApiQuery({ name, required: false, schema: { ...s, anyOf: undefined, type: s.type ?? 'string' } }),
    ),
  );
}
