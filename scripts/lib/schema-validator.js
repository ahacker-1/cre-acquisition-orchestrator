const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMA_ROOT = path.resolve(__dirname, '..', '..', 'schemas');

let cachedAjv = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkSchemaFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkSchemaFiles(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith('.schema.json')) files.push(fullPath);
  }
  return files;
}

function createAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    allowUnionTypes: true
  });
  addFormats(ajv);

  for (const filePath of walkSchemaFiles(SCHEMA_ROOT)) {
    const schema = readJson(filePath);
    ajv.addSchema(schema, schema.$id || path.relative(SCHEMA_ROOT, filePath).replace(/\\/g, '/'));
  }

  return ajv;
}

function getAjv() {
  if (!cachedAjv) cachedAjv = createAjv();
  return cachedAjv;
}

function formatError(error, rootName) {
  const pathParts = [rootName];
  if (error.instancePath) {
    pathParts.push(
      error.instancePath
        .replace(/^\//, '')
        .split('/')
        .filter(Boolean)
        .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
        .join('.')
    );
  }
  if (error.keyword === 'required' && error.params?.missingProperty) {
    pathParts.push(error.params.missingProperty);
  }
  const dataPath = pathParts.filter(Boolean).join('.');
  return `${dataPath}: ${error.message}`;
}

function validatorForSchema(schema) {
  const ajv = getAjv();
  if (schema.$id) {
    const validate = ajv.getSchema(schema.$id);
    if (validate) return validate;
  }
  return ajv.compile(schema);
}

function validateData(schema, data, rootName = 'data') {
  const validate = validatorForSchema(schema);
  const valid = validate(data);
  const errors = valid ? [] : (validate.errors || []).map((error) => formatError(error, rootName));
  return {
    valid,
    errors
  };
}

function validateFile(schemaPath, data, rootName = 'data') {
  const schema = readJson(schemaPath);
  return validateData(schema, data, rootName);
}

function assertValid(schemaPath, data, rootName = 'data') {
  const result = validateFile(schemaPath, data, rootName);
  if (!result.valid) {
    const rel = path.relative(process.cwd(), schemaPath);
    const details = result.errors.map((error) => `  - ${error}`).join('\n');
    throw new Error(`Schema validation failed (${rel})\n${details}`);
  }
}

module.exports = {
  validateData,
  validateFile,
  assertValid,
  readJson
};
