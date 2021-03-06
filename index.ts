import dotenv from 'dotenv';
import yargs from 'yargs';
import chalk from 'chalk';

const { fsync, prod } = yargs
    .usage('\nKordy CLI Usage:')
    .option('fsync', {
        description:
            'Forces Sequelize to drop the tables before server starts.',
    })
    .option('prod', {
        description: 'Starts the server in production mode.',
    })
    .version()
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .describe({
        help: 'Show help',
        version: 'Show version',
    })
    .epilog('Kordy - 2020, All rights reserved.').argv;

process.env.NODE_ENV = prod ? 'production' : 'development';

dotenv.config({ path: `${__dirname}/.env.${process.env.NODE_ENV}` });

import http from 'http';
import Server from './src/server';
import WebSocketServer from './src/websocket';
import { sequelize } from './src/config/database';

if (fsync) {
    console.log(
        `${chalk.yellow(
            'Warning!',
        )} Sequelize force sync will drop the tables when enabled.`,
    );
    sequelize.sync({ force: true });
}

const server = http.createServer(new Server().app);

const { PORT = 3001, DB_DATABASE } = process.env;

server.on('upgrade', new WebSocketServer().onUpgrade);
server.listen(PORT, () => {
    console.log(
        `${chalk.green('Success!')} Server listening on ${chalk.cyan(
            `http://localhost:${PORT}`,
        )}`,
    );

    sequelize
        .authenticate()
        .then(() =>
            console.log(
                `${chalk.green('Success!')} Connection to ${chalk.yellow(
                    DB_DATABASE,
                )} established.`,
            ),
        )
        .catch((error) => console.error(error));
});
