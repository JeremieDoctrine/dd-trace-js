'use strict'

const { expect } = require('chai')
const semver = require('semver')
const agent = require('../../dd-trace/test/plugins/agent')
const nock = require('nock')

describe('Plugin', () => {
  let openai

  describe('openai', () => {
    withVersions('openai', 'openai', version => {

      beforeEach(() => {
        require('../../dd-trace')
      })

      before(() => {
        return agent.load('openai')
      })

      after(() => {
        return agent.close({ ritmReset: false })
      })

      beforeEach(() => {
        const { Configuration, OpenAIApi } = require(`../../../versions/openai@${version}`).get()

        const configuration = new Configuration({
          apiKey: 'sk-DATADOG-ACCEPTANCE-TESTS',
        });
        
        openai = new OpenAIApi(configuration);
      })

      describe('create completion', () => {
        let scope

        before(() => {
          scope = nock('https://api.openai.com:443', {"encodedQueryParams":true})
          .post('/v1/completions', {"model":"text-davinci-002","prompt":"Hello, "})
          .reply(200, {
            "id":"cmpl-7GWDlQbOrAYGmeFZtoRdOEjDXDexM",
            "object":"text_completion",
            "created":1684171461,
            "model":"text-davinci-002",
            "choices":[{
              "text":"FOO BAR BAZ",
              "index":0,
              "logprobs":null,
              "finish_reason":"length"
            }],
            "usage":{"prompt_tokens":3,"completion_tokens":16,"total_tokens":19}
          }, [
            'Date', 'Mon, 15 May 2023 17:24:22 GMT',
            'Content-Type', 'application/json',
            'Content-Length', '349',
            'Connection', 'close',
            'access-control-allow-origin', '*',
            'Cache-Control', 'no-cache, must-revalidate',
            'openai-model', 'text-davinci-002',
            'openai-organization', 'kill-9',
            'openai-processing-ms', '442',
            'openai-version', '2020-10-01',
            'strict-transport-security', 'max-age=15724800; includeSubDomains',
            'x-ratelimit-limit-requests', '3000',
            'x-ratelimit-limit-tokens', '250000',
            'x-ratelimit-remaining-requests', '2999',
            'x-ratelimit-remaining-tokens', '249984',
            'x-ratelimit-reset-requests', '20ms',
            'x-ratelimit-reset-tokens', '3ms',
            'x-request-id', '1337cafe',
            'CF-Cache-Status', 'DYNAMIC',
            'Server', 'cloudflare',
            'CF-RAY', 'cafe1337-SJC',
            'alt-svc', 'h3=":443"; ma=86400, h3-29=":443"; ma=86400'
          ]);
        })

        after(() => {
          nock.removeInterceptor(scope)
          scope.done()
        })

        it('makes a successful call', async () => {
          const checkTraces = agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('name', 'openai.request')
              expect(traces[0][0]).to.have.property('type', 'openai')
              expect(traces[0][0]).to.have.property('resource', 'createCompletion/text-davinci-002')
              expect(traces[0][0]).to.have.property('error', 0)

              expect(traces[0][0].meta).to.have.property('component', 'openai')
              expect(traces[0][0].meta).to.have.property('openai.user.api_key', 'sk-...ESTS')
              expect(traces[0][0].meta).to.have.property('openai.model', 'text-davinci-002')
              expect(traces[0][0].meta).to.have.property('openai.api_base', 'https://api.openai.com/v1')
              expect(traces[0][0].meta).to.have.property('openai.request.prompt', 'Hello, ')
              expect(traces[0][0].meta).to.have.property('openai.organization.name', 'kill-9')
              expect(traces[0][0].meta).to.have.property('openai.response.choices.0.finish_reason', 'length')
              expect(traces[0][0].meta).to.have.property('openai.response.choices.0.logprobs', 'returned')
              expect(traces[0][0].meta).to.have.property('openai.response.choices.0.text', 'FOO BAR BAZ')

              expect(traces[0][0].metrics).to.have.property('openai.response.usage.prompt_tokens', 3)
              expect(traces[0][0].metrics).to.have.property('openai.response.usage.completion_tokens', 16)
              expect(traces[0][0].metrics).to.have.property('openai.response.usage.total_tokens', 19)

            })

          const result = await openai.createCompletion({
            model: "text-davinci-002",
            prompt: "Hello, ",
          });

          expect(result.data.id).to.eql('cmpl-7GWDlQbOrAYGmeFZtoRdOEjDXDexM')

          await checkTraces
        })
      })

      describe('create embedding', () => {
        let scope

        before(() => {
          scope = nock('https://api.openai.com:443', {"encodedQueryParams":true})
            .post('/v1/embeddings', {"model":"text-embedding-ada-002","input":"Cat?","user":"hunter2"})
            .reply(200, {"object":"list","data":[{"object":"embedding","index":0,"embedding":[-0.0034387498,-0.026400521]}],"model":"text-embedding-ada-002-v2","usage":{"prompt_tokens":2,"total_tokens":2}},[
            'Date', 'Mon, 15 May 2023 20:49:06 GMT',
            'Content-Type', 'application/json',
            'Content-Length', '75',
            'access-control-allow-origin', '*',
            'openai-organization', 'datadog-4',
            'openai-processing-ms', '344',
            'openai-version', '2020-10-01',
          ])
        })

        after(() => {
          nock.removeInterceptor(scope)
          scope.done()
        })

        it('makes a successful call', async () => {
          const checkTraces = agent
            .use(traces => {
              expect(traces[0][0]).to.have.property('name', 'openai.request')
              expect(traces[0][0]).to.have.property('type', 'openai')
              expect(traces[0][0]).to.have.property('resource', 'createEmbedding/text-embedding-ada-002')
              expect(traces[0][0]).to.have.property('error', 0)

              expect(traces[0][0].meta).to.have.property('openai.model', 'text-embedding-ada-002-v2')
              expect(traces[0][0].meta).to.have.property('openai.request.input', 'Cat?')

              expect(traces[0][0].metrics).to.have.property('openai.response.usage.prompt_tokens', 2)
              expect(traces[0][0].metrics).to.have.property('openai.response.usage.total_tokens', 2)

            })

          const result = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: "Cat?",
            user: "hunter2"
          });

          expect(result.data.model).to.eql('text-embedding-ada-002-v2')

          await checkTraces
        })
      })

      if (semver.intersects(version, '3.2')) {
        describe('create chat completion', () => {
          let scope

          before(() => {
            scope = nock('https://api.openai.com:443', {"encodedQueryParams":true})
              .post('/v1/chat/completions', {"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Peanut Butter or Jelly?","name":"hunter2"},{"role":"assistant","content":"Are you allergic to peanuts?","name":"hal"},{"role":"user","content":"Deathly allergic!","name":"hunter2"}],"temperature":1.001,"n":1,"stream":false,"max_tokens":10,"presence_penalty":-0.0001,"frequency_penalty":0.0001,"logit_bias":{"1234":-1},"user":"hunter2"})
              .reply(200, {"id":"chatcmpl-7GaWqyMTD9BLmkmy8SxyjUGX3KSRN","object":"chat.completion","created":1684188020,"model":"gpt-3.5-turbo-0301","usage":{"prompt_tokens":37,"completion_tokens":10,"total_tokens":47},"choices":[{"message":{"role":"assistant","content":"In that case, it's best to avoid peanut"},"finish_reason":"length","index":0}]}, [
              'Date', 'Mon, 15 May 2023 22:00:21 GMT',
              'Content-Type', 'application/json',
              'Content-Length', '327',
              'Connection', 'close',
              'access-control-allow-origin', '*',
              'Cache-Control', 'no-cache, must-revalidate',
              'openai-model', 'gpt-3.5-turbo-0301',
              'openai-organization', 'datadog-4',
              'openai-processing-ms', '713',
              'openai-version', '2020-10-01',
            ]);
          })

          after(() => {
            nock.removeInterceptor(scope)
            scope.done()
          })

          it('makes a successful call', async () => {
            const checkTraces = agent
              .use(traces => {
                expect(traces[0][0]).to.have.property('name', 'openai.request')
                expect(traces[0][0]).to.have.property('type', 'openai')
                expect(traces[0][0]).to.have.property('resource', 'createChatCompletion/gpt-3.5-turbo')
                expect(traces[0][0]).to.have.property('error', 0)

                expect(traces[0][0].meta).to.have.property('openai.model', 'gpt-3.5-turbo-0301')
                expect(traces[0][0].meta).to.have.property('openai.request.user', 'hunter2')

                expect(traces[0][0].meta).to.have.property('openai.request.0.content', 'Peanut Butter or Jelly?')
                expect(traces[0][0].meta).to.have.property('openai.request.0.role', 'user')

                expect(traces[0][0].meta).to.have.property('openai.request.1.content', 'Are you allergic to peanuts?')
                expect(traces[0][0].meta).to.have.property('openai.request.1.role', 'assistant')

                expect(traces[0][0].meta).to.have.property('openai.request.2.content', 'Deathly allergic!')
                expect(traces[0][0].meta).to.have.property('openai.request.2.role', 'user')

                expect(traces[0][0].meta).to.have.property('openai.response.choices.0.finish_reason', 'length')
                expect(traces[0][0].meta).to.have.property('openai.response.choices.0.message.role', 'assistant')
                expect(traces[0][0].meta).to.have.property('openai.response.choices.0.message.content', "In that case, it's best to avoid peanut")

                expect(traces[0][0].metrics).to.have.property('openai.request.max_tokens', 10)
                expect(traces[0][0].metrics).to.have.property('openai.request.temperature', 1.001)
                expect(traces[0][0].metrics).to.have.property('openai.request.stream', 0)
                expect(traces[0][0].metrics).to.have.property('openai.request.presence_penalty', -0.0001)
                expect(traces[0][0].metrics).to.have.property('openai.request.logit_bias.1234', -1)
                expect(traces[0][0].metrics).to.have.property('openai.response.usage.prompt_tokens', 37)
                expect(traces[0][0].metrics).to.have.property('openai.response.usage.completion_tokens', 10)
                expect(traces[0][0].metrics).to.have.property('openai.response.usage.total_tokens', 47)
                expect(traces[0][0].metrics).to.have.property('openai.response.choices.0.logprobs', 0)
              })

            const result = await openai.createChatCompletion({
              model: "gpt-3.5-turbo",
              messages: [
                {
                  "role": "user",
                  "content": "Peanut Butter or Jelly?",
                  "name": "hunter2"
                },
                {
                  "role": "assistant",
                  "content": "Are you allergic to peanuts?",
                  "name": "hal"
                },
                {
                  "role": "user",
                  "content": "Deathly allergic!",
                  "name": "hunter2"
                },
              ],
              temperature: 1.001,
              n: 1,
              stream: false,
              max_tokens: 10,
              presence_penalty: -0.0001,
              frequency_penalty: 0.0001,
              logit_bias: {
                "1234": -1
              },
              user: "hunter2"
            })

            expect(result.data.id).to.eql('chatcmpl-7GaWqyMTD9BLmkmy8SxyjUGX3KSRN')
            expect(result.data.model).to.eql('gpt-3.5-turbo-0301')
            expect(result.data.choices[0].message.role).to.eql('assistant')
            expect(result.data.choices[0].message.content).to.eql('In that case, it\'s best to avoid peanut')
            expect(result.data.choices[0].finish_reason).to.eql('length')

            await checkTraces
          })
        })
      }
    })
  })
})
