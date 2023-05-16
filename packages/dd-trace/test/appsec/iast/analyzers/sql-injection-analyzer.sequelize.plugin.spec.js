'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { prepareTestServerForIast } = require('../utils')
const { storage } = require('../../../../../datadog-core')
const iastContextFunctions = require('../../../../src/appsec/iast/iast-context')
const { newTaintedString } = require('../../../../src/appsec/iast/taint-tracking/operations')
const vulnerabilityReporter = require('../../../../src/appsec/iast/vulnerability-reporter')

describe('sql-injection-analyzer with sequelize+pg', () => {
  withVersions('sequelize', 'sequelize', sequelizeVersion => {
    withVersions('mysql2', 'mysql2', (mysqlVersion) => {
      let sequelize

      prepareTestServerForIast('sequelize + mysql2',
        (testThatRequestHasVulnerability, testThatRequestHasNoVulnerability) => {
          beforeEach(() => {
            const Sequelize = require(`../../../../../../versions/sequelize@${sequelizeVersion}`).get()
            sequelize = new Sequelize('db', 'root', '', {
              host: '127.0.0.1',
              dialect: 'mysql'
            })
            vulnerabilityReporter.clearCache()
            return sequelize.authenticate()
          })

          testThatRequestHasVulnerability(() => {
            const store = storage.getStore()
            const iastCtx = iastContextFunctions.getIastContext(store)

            let sql = 'SELECT 1'
            sql = newTaintedString(iastCtx, sql, 'param', 'Request')

            return sequelize.query(sql)
          }, 'SQL_INJECTION', { occurrences: 1 })

          const externalFileContent = `'use strict'

module.exports = function (sequelize, sql) {
  return sequelize.query(sql)
}
`
          testThatRequestHasVulnerability(() => {
            const filepath = path.join(os.tmpdir(), 'test-sequelize-sqli.js')
            fs.writeFileSync(filepath, externalFileContent)

            const store = storage.getStore()
            const iastCtx = iastContextFunctions.getIastContext(store)

            let sql = 'SELECT 1'
            sql = newTaintedString(iastCtx, sql, 'param', 'Request')

            return require(filepath)(sequelize, sql)
          }, 'SQL_INJECTION', {
            occurrences: 1,
            location: {
              path: 'test-sequelize-sqli.js',
              line: 4
            }
          })

          testThatRequestHasNoVulnerability(() => {
            return sequelize.query('SELECT 1')
          }, 'SQL_INJECTION')
        })
    })
  })
})
