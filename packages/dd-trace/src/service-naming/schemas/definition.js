class SchemaDefinition {
  constructor (schema) {
    this.schema = schema
  }

  getSchemaItem (type, kind, plugin) {
    const schema = this.schema
    if (schema && schema[type] && schema[type][kind] && schema[type][kind][plugin]) {
      return schema[type][kind][plugin]
    }
  }

  getOpName (type, kind, plugin, ...opNameArgs) {
    const item = this.getSchemaItem(type, kind, plugin)
    return item.opName(...opNameArgs)
  }

  getServiceName (type, kind, plugin, ...serviceNameArgs) {
    const item = this.getSchemaItem(type, kind, plugin)
    return item.serviceName(this.service, ...serviceNameArgs)
  }

  configure ({ service }) {
    this.service = service
  }
}

module.exports = SchemaDefinition
