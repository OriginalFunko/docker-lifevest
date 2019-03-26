![](images/lifevestlogo.png)

A utility to backup or transfer a Docker Swarm.


<!-- TOC START min:1 max:3 link:true asterisk:false update:true -->
- [Usage](#usage)
  - [Backup a Swarm](#backup-a-swarm)
  - [Restore from Backup](#restore-from-backup)
  - [Copy from Swarm to Swarm](#copy-from-swarm-to-swarm)
- [Registry Authentication](#registry-authentication)
- [Flags](#flags)
- [Known Issues / TODO](#known-issues--todo)
<!-- TOC END -->


# Usage

Install this utility by running `npm install -g docker-lifevest`.

A quick reference is available with `docker-lifevest --help`.

A few common usages are below:

## Backup a Swarm
To take a backup of a Swarm, run `docker-lifevest --source <docker swarm IP or DNS>`. A folder called `backup-<datestamp>` will be created in the current directory.

To change the output directory, add `--destination <new folder path>`

## Restore from Backup
To restore from a backup folder, run `docker-lifevest --input folder --source <folder path> --output swarm --destination <docker swarm IP or DNS>`.

If your services pull from a private registry, you must create a JSON file containing authentication for that registry at `registry-credentials.json`. See [Registry Authentication](#registry-authentication).

Existing items will not be replaced; it is recommended that you start with a clean Swarm by doing something like the following:
```
systemctl stop docker; rm -rf /var/lib/docker/swarm; systemctl start docker; docker swarm init
```

## Copy from Swarm to Swarm
To copy from one Swarm to another without an intermediate backup, run `docker-lifevest --source <source IP or DNS> --output swarm --destination <dest IP or DNS>`

# Registry Authentication
If your services use authentication when pulling their images, you will need to create a JSON file containing those credentials in order to restore those services.

The JSON file must follow Docker's [API format](https://docs.docker.com/engine/api/v1.37/#section/Authentication). Only services with images matching the `serveraddress` field in that file will use the authentication credentials, so images from other registries will not be affected.

When using `--output swarm`, add this file with the `--registry-credentials <file path>` flag.

# Flags

| Flag                 | Aliases | Default | Description                                                                                                                         |
| -------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| input                | in, i   | swarm   | The type of source. Valid values are `swarm`, `folder`                                                                              |
| source               | s       | N/A     | The source. If input is `swarm`, an IP or DNS name. If `folder`, a path to a previously created backup.                             |
| output               | out, o  | folder  | The type of destination. Valid values are `swarm`, `folder`.                                                                        |
| destination          | dest, d | N/A     | The destination. If output is `swarm`, an IP or DNS name. If `folder`, default is `backup-<timestamp>`                              |
| registry-credentials | R       | N/A     | A path to a JSON file used to specify registry authentication. See [Registry Authentication](#registry-authentication) for details. |
| verbose              | v       |         | Add up to three times to increase logging.                                                                                          |
| quiet                | q       |         | Add to silence all logging.                                                                                                         |
| help                 |         |         | Add to show a quick reference.                                                                                                      |

# Known Issues / TODO

Currently only services, configs, and secrets are backed up. More object types may be added in the future.
