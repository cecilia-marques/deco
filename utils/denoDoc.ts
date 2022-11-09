import { exec, OutputMode } from "https://deno.land/x/exec/mod.ts";
import { JSONSchema7 } from "json-schema";

/**
 * Transforms myPropName into "My Prop Name" for cases
 * when there's no label specified
 *
 * TODO: Support i18n in the future
 */
const beautifyPropName = (propName: string) => {
  return (
    propName
      // insert a space before all caps
      .replace(/([A-Z])/g, " $1")
      // uppercase the first character
      .replace(/^./, function (str) {
        return str.toUpperCase();
      })
  );
};

export async function readDenoDocJson(filePath: string) {
  const { output: rawOutput } = await exec(`deno doc ${filePath} --json`, {
    output: OutputMode.Capture,
  });
  const denoDocOutput = JSON.parse(rawOutput);
  return denoDocOutput;
}

export function getFunctionOutputSchemaFromDocs(
  docs: DenoDocResponse[],
  entityName: string
) {
  const defaultFunctionExport = docs.find(
    ({ name, kind }) => name === "default" && kind === "variable"
  );

  if (!defaultFunctionExport) {
    console.log(
      `${entityName} should have a named function as the default export. Check the docs here: #TODO`
    );
  }

  const functionTsType = defaultFunctionExport?.variableDef?.tsType;
  const functionTypeName = functionTsType?.repr; // E.g: LoaderFunction

  const VALID_FUNCTION_TYPES = ["LoaderFunction"];

  if (
    !functionTypeName ||
    !functionTsType ||
    !VALID_FUNCTION_TYPES.includes(functionTypeName)
  ) {
    console.log(
      `${entityName} should export a function with one of Live's provided types: LoaderFunction.`
    );

    return null;
  }

  const outputTypeName = functionTsType?.typeRef?.typeParams?.map(
    ({ repr }) => repr
  )[1]; // E.g: Product

  if (!outputTypeName && functionTypeName === "LoaderFunction") {
    console.log(
      `${entityName} should specify its return type like this: LoaderFunction<Props, Product>, where Product is the return type.`
    );
    return null;
  }

  const outputTypeUrl = docs.find(
    ({ kind, name }) => kind === "import" && name === outputTypeName
  )?.importDef?.src; // E.g: file:///Users/lucis/deco/live/std/commerce/types/Product.ts

  if (!outputTypeUrl) {
    console.log(
      `Couldn't find import for output type '${outputTypeName}' in ${entityName}.`
    );
  }

  // TODO: Do this more elegantly
  const typeId = "live" + outputTypeUrl?.split("/live")[1];

  const outputSchema: JSONSchema7 = {
    type: "object",
    properties: {
      data: {
        $id: typeId,
      },
    },
    // Technically, this function might return additional data (like headers and status), but
    // they don't matter for the schema now
    additionalProperties: true,
  };

  return outputSchema;
}

export function getInputSchemaFromDocs(
  docs: DenoDocResponse[],
  entityName?: string
): JSONSchema7 | null {
  const propsExport = docs.find(({ name }) => name === "Props");

  if (!propsExport) {
    console.log(
      `${entityName} doesn't export a Props interface definition, couldn't extract schema.`
    );
    return null;
  }

  const componentName = propsExport.location.filename
    .split("/")
    .pop()
    ?.replace(/\.ts(x|)/g, "");
  const properties = propsExport.interfaceDef?.properties;

  const jsonSchemaProperties = properties?.reduce((acc, cur) => {
    const propName = cur.name;
    const propType = cur.tsType.repr as "string" | "number" | "array" | "";

    const specifiedLabel = cur.jsDoc?.tags
      ?.find(({ value }) => value.includes("@label"))
      ?.value?.replace("@label", "")
      .trim();

    const title = specifiedLabel || beautifyPropName(propName);

    const baseProp: JSONSchema7 = {
      title,
      type: propType || "string",
    };

    if (!propType) {
      // Some options: Inline object (typeLiteral), enum (kind: union)
      switch (cur.tsType.kind) {
        case "typeLiteral": {
          // Probably need to handle with arrays as well
          const innerProperties = cur.tsType.typeLiteral?.properties?.reduce(
            (acc, { name, tsType }) => {
              const type = tsType.repr as "string" | "number";
              return {
                ...acc,
                [name]: {
                  // TODO: Support annotated @label here as well (recursion?)
                  title: beautifyPropName(name),
                  type,
                },
              };
            },
            {} as JSONSchema7["properties"]
          );
          baseProp.type = "object";
          baseProp.properties = innerProperties;
          break;
        }
        case "union": {
          baseProp.type = "array";
          baseProp.items = {
            type: "string",
            enum: cur.tsType.union?.map(({ repr }) => repr),
          };
        }
      }
    }

    return {
      ...acc,
      [propName]: {
        ...baseProp,
      },
    };
  }, {} as JSONSchema7["properties"]);

  const baseJsonSchema: JSONSchema7 = {
    title: componentName,
    type: "object",
  };

  const componentSchema: JSONSchema7 = {
    ...baseJsonSchema,
    properties: jsonSchemaProperties,
  };

  return componentSchema;
}

export interface DenoDocResponse {
  kind: string;
  name: string;
  location: Location;
  declarationKind: string;
  interfaceDef?: InterfaceDef;
  functionDef?: FunctionDef;
  variableDef?: VariableDef;
  importDef?: ImportDef;
}
export interface VariableDef {
  tsType: TsTypeElement;
  kind: string;
}

export interface TsTypeElement {
  repr: string;
  kind: string;
  typeRef: TypeRef;
}

export interface FunctionDef {
  params: Param[];
  returnType: null;
  hasBody: boolean;
  isAsync: boolean;
  isGenerator: boolean;
  typeParams: any[];
}

export interface Param {
  kind: string;
  props: Prop[];
  optional: boolean;
  tsType: TsType;
}

export interface Prop {
  kind: string;
  key: string;
  value: null;
}

export interface TsType {
  repr: string;
  kind: string;
  typeRef: TypeRef;
}

export interface TypeRef {
  typeParams: null | Array<TsTypeElement>;
  typeName: string;
}

export interface ImportDef {
  src: string;
  imported: string;
}

export interface InterfaceDef {
  extends: any[];
  methods: any[];
  properties: InterfaceDefProperty[];
  callSignatures: any[];
  indexSignatures: any[];
  typeParams: any[];
}

export interface InterfaceDefProperty {
  name: string;
  location: Location;
  params: any[];
  computed: boolean;
  optional: boolean;
  tsType: PurpleTsType;
  typeParams: any[];
  jsDoc?: JSDoc;
}

export interface JSDoc {
  tags: Tag[];
}

export interface Tag {
  kind: string;
  value: string;
}

export interface Location {
  filename: Filename;
  line: number;
  col: number;
}

export type Filename = string;

export interface PurpleTsType {
  repr: string;
  kind: string;
  keyword?: string;
  array?: TsType;
  union?: Union[];
  typeLiteral?: TypeLiteral;
}

export interface TypeLiteral {
  methods: any[];
  properties: TypeLiteralProperty[];
  callSignatures: any[];
  indexSignatures: any[];
}

export interface TypeLiteralProperty {
  name: string;
  params: any[];
  computed: boolean;
  optional: boolean;
  tsType: FluffyTsType;
  typeParams: any[];
}

export interface FluffyTsType {
  repr: string;
  kind: string;
  keyword: string;
}

export interface Union {
  repr: string;
  kind: string;
  literal: Literal;
}

export interface Literal {
  kind: string;
  string: string;
}