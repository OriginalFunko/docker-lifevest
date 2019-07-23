const urlParseLax = require('url-parse-lax')
const qs = require('querystring')

// Default options for Docker host URL structure
const defaultHostOptions = {
  protocol: 'http',
  port: 2375,
  version: 'v1.37',
}

module.exports = function parse(input) {
  // Set up Dockerode
  const parsedHostUrl = urlParseLax(input, { https: false })

  const options = {
    protocol: parsedHostUrl.protocol,
    host: parsedHostUrl.hostname,
  }

  // The parser library tends to default to port 80 when Docker's default is 2375.
  // Only include explicitly specified ports.
  if( input.includes(`:${parsedHostUrl.port}`) ) {
    options.port = parsedHostUrl.port
  }

  // Remove trailing colon on protocol
  if( options.protocol && options.protocol.endsWith(':') ) {
    options.protocol = options.protocol.slice(0, -1)
  }

  // Merge query parameters to the main object if they exist.
  if( 'query' in parsedHostUrl && parsedHostUrl.query ) {
    const parsedQuery = qs.parse(parsedHostUrl.query)
    Object.assign(options, parsedQuery)
  }

  return Object.assign({}, defaultHostOptions, options)
}
