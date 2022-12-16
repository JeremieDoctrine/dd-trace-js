'use strict'

const express = require('express')
const bodyParser = require('body-parser')

const app = express()

let requests = 0
let bytes = 0

app.use(bodyParser.raw({ limit: '50mb', type: () => true }))
app.use('*', (req, res) => {
  requests++
  bytes += req.body.length

  console.log(`Requests: ${requests}`) // eslint-disable-line no-console
  console.log(`Bytes: ${bytes}`) // eslint-disable-line no-console

  res.status(200).send()
})

app.listen(8126)
