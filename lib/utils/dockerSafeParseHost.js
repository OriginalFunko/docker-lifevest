const url = require('url')

// Default options for Docker host URL structure
const defaultHostOptions = {
	protocol: 'http',
	port: 2375,
	version: 'v1.37',
}

module.exports = function parse(input) {
	// Set up Dockerode
	const parsedHostUrl = url.parse(input)
	if( parsedHostUrl.host === null && parsedHostUrl.pathname !== null ) {
		// Plain hostname parses wrong.
		return Object.assign({}, defaultHostOptions, {host: parsedHostUrl.pathname})
	}

	return Object.assign({}, defaultHostOptions, parsedHostUrl)
}
