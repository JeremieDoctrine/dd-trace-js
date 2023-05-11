'use strict'

function addMetricsToSpan (rootSpan, metrics, tagPrefix) {
  if (!rootSpan || !rootSpan.addTags || !metrics) return

  const flattenMap = new Map()
  metrics
    .filter(data => data && data.metric && data.metric.hasRequestScope())
    .forEach(data => {
      const name = taggedMetricName(data)
      let total = flattenMap.get(name)
      const value = flatten(data)
      if (!total) {
        total = value
      } else {
        total += value
      }
      flattenMap.set(name, total)
    })

  for (const [key, value] of flattenMap) {
    const tagName = `${tagPrefix}.${key}`
    rootSpan.addTags({
      [tagName]: value
    })
  }
}

function flatten (metricData) {
  return metricData.points && metricData.points.map(point => point.value).reduce((total, value) => total + value, 0)
}

function taggedMetricName (data) {
  const metric = data.metric
  const tagValue = data.tag
  return metric.metricTag == null || tagValue == null
    ? metric.name
    : `${metric.name}.${processTagValue(tagValue)}`
}

function processTagValue (tagValue) {
  return tagValue.toLowerCase().replace(/\./g, '_')
}

module.exports = {
  addMetricsToSpan
}
