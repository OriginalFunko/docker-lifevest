const Dockerode = require('simple-dockerode')

const imageTag = 'docker:dind'

const main = async () => {
  const hostDocker = new Dockerode()

  const allImages = await hostDocker.listImages()

  const haveDindImage = allImages.find(img =>
    'RepoTags' in img && Array.isArray(img.RepoTags) && img.RepoTags.includes(imageTag)
  )

  if( !haveDindImage ) {
    console.log(`Pulling ${imageTag} image for tests...`)
    await hostDocker.pull(imageTag)
  }
}

main()
