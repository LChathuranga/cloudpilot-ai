import { z } from "zod";

export const schemaVersionSchema = z.string().regex(/^\d+\.\d+$/, {
  message: "Schema version must use the MAJOR.MINOR format.",
});

export const componentFamilySchema = z.enum([
  "workflow-action",
  "control-flow",
  "integration",
  "infrastructure-resource",
]);

export const portDirectionSchema = z.enum(["input", "output"]);
export const portDataTypeSchema = z.enum([
  "any",
  "string",
  "number",
  "boolean",
  "artifact",
  "resource-reference",
  "event",
  "object",
]);

export const componentPortSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
  direction: portDirectionSchema,
  dataType: portDataTypeSchema,
  required: z.boolean().default(false),
  multiple: z.boolean().default(false),
});

export const componentDefinitionMetadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  version: schemaVersionSchema,
  label: z.string().min(1).max(100),
  description: z.string().max(500),
  family: componentFamilySchema,
  maturity: z.enum(["design", "mock", "preview", "supported"]),
  inputs: z.array(componentPortSchema).default([]),
  outputs: z.array(componentPortSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
});

export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
export type ComponentFamily = z.infer<typeof componentFamilySchema>;
export type PortDirection = z.infer<typeof portDirectionSchema>;
export type PortDataType = z.infer<typeof portDataTypeSchema>;
export type ComponentPort = z.infer<typeof componentPortSchema>;
export type ComponentDefinitionMetadata = z.infer<typeof componentDefinitionMetadataSchema>;

export interface ComponentDefinition<TConfig extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly metadata: ComponentDefinitionMetadata;
  readonly configSchema: TConfig;
  readonly defaultConfig: z.input<TConfig>;
}

export function defineComponent<TConfig extends z.ZodTypeAny>(
  definition: ComponentDefinition<TConfig>,
): ComponentDefinition<TConfig> {
  componentDefinitionMetadataSchema.parse(definition.metadata);
  definition.configSchema.parse(definition.defaultConfig);
  const inputIds = new Set(definition.metadata.inputs.map((port) => port.id));
  const outputIds = new Set(definition.metadata.outputs.map((port) => port.id));
  if (inputIds.size !== definition.metadata.inputs.length) {
    throw new Error(`Component "${definition.metadata.id}" has duplicate input port IDs.`);
  }
  if (outputIds.size !== definition.metadata.outputs.length) {
    throw new Error(`Component "${definition.metadata.id}" has duplicate output port IDs.`);
  }
  if (definition.metadata.inputs.some((port) => port.direction !== "input")) {
    throw new Error(`Component "${definition.metadata.id}" has an input port with the wrong direction.`);
  }
  if (definition.metadata.outputs.some((port) => port.direction !== "output")) {
    throw new Error(`Component "${definition.metadata.id}" has an output port with the wrong direction.`);
  }
  return Object.freeze({
    ...definition,
    metadata: Object.freeze({
      ...definition.metadata,
      inputs: Object.freeze([...definition.metadata.inputs]),
      outputs: Object.freeze([...definition.metadata.outputs]),
      tags: Object.freeze([...definition.metadata.tags]),
    }),
  });
}

export function validateComponentConfig<TConfig extends z.ZodTypeAny>(
  definition: ComponentDefinition<TConfig>,
  config: unknown,
): { success: true; data: z.output<TConfig> } | { success: false; errors: string[] } {
  const result = definition.configSchema.safeParse(config);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "config";
      return `${path}: ${issue.message}`;
    }),
  };
}
