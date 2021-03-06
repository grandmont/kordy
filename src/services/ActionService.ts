import {
    ServerInterface,
    ClientInterface,
    ResponseInterface,
    Action,
} from '../websocket';

// Interfaces
interface ActionResponse {
    clients: Array<ClientInterface>;
    response: ResponseInterface;
}

// ActionService class
export default class ActionService {
    server: ServerInterface;
    client: ClientInterface;
    broadcast: Function;

    constructor(
        server: ServerInterface,
        client: ClientInterface,
        broadcast: Function,
    ) {
        this.server = server;
        this.client = client;
        this.broadcast = broadcast;

        // Add an event listener to the waiting room
        this.server.rooms.addEventListener(this.handleJoinWaitingListChanges);
    }

    handleAction = async (
        action: Action,
        data = null,
    ): Promise<ActionResponse> =>
        await {
            'join-waiting-list': this.handleJoinWaitingList,
            'join-chat': this.handleJoinChat,
            'left-chat': this.handleLeftChat,
            'chat-message': this.handleChatMessage,
            disconnect: this.handleDisconnect,
        }[action](data);

    handleJoinWaitingList = () => {
        // Puts the client inside the waiting room
        Object.assign(this.server.rooms, {
            waiting: [...this.server.rooms.waiting, this.client],
        });
        return responseHandler([], 'join-waiting-list');
    };

    removeFromWaitingList = (clients: ClientInterface[]) => {
        clients.length &&
            clients.forEach(
                ({
                    connection: {
                        user: { id: userId },
                    },
                }) => {
                    const clientWaitingIndex = this.server.rooms.waiting.findIndex(
                        ({ connection: { user } }) => userId === user.id,
                    );

                    if (clientWaitingIndex !== -1) {
                        this.server.rooms.waiting.splice(clientWaitingIndex, 1);
                    }
                },
            );
    };

    handleJoinWaitingListChanges = (waiting: ClientInterface[]) =>
        new Promise((resolve) => {
            if (waiting.length > 1) {
                // Gets the first and second clients from the waiting list
                const [first, second] = this.server.rooms.waiting;

                const firstId = first.connection.user.id;
                const secondId = second.connection.user.id;

                // Removes the client from the waiting list in the server rooms
                this.removeFromWaitingList([first, second]);

                // Check witch one is greater than the other and generate a room
                const room =
                    firstId > secondId
                        ? `${secondId}-${firstId}`
                        : `${firstId}-${secondId}`;

                // Creates the room with the clients
                this.server.rooms[room] = [first, second];

                // Adds the room in the current open rooms of the clients
                first.connection.rooms.push(room);
                second.connection.rooms.push(room);

                // Send a join-chat response to the clients
                const { clients, response } = responseHandler(
                    [first, second],
                    'join-chat',
                    { room },
                );

                this.broadcast(clients, response);

                return resolve();
            }
            return resolve();
        });

    handleChatMessage = async ({ room, content }): Promise<ActionResponse> => {
        try {
            const {
                user: { id, kordy },
            } = this.client.connection;

            return responseHandler(this.server.rooms[room], 'chat-message', {
                user: { id, kordy },
                content,
            });
        } catch (error) {
            return errorHandler([this.client], { error: error.message });
        }
    };

    handleJoinChat = async ({ room }): Promise<ActionResponse> => {
        try {
            // Creates the room if it does not exist
            Object.assign(this.server.rooms, {
                [room]: [...this.server.rooms[room], this.client],
            });

            // Adds the room in the current open rooms of the client
            this.client.connection.rooms.push(room);

            return responseHandler(this.server.rooms[room], 'join-chat', {
                room,
            });
        } catch (error) {
            return errorHandler([this.client], { error: error.message });
        }
    };

    handleLeftChat = async ({ room }): Promise<ActionResponse> => {
        try {
            const {
                connection: {
                    rooms,
                    user: { id: userId, kordy },
                },
            } = this.client;

            // Checks if the user is inside the waiting room and remove him
            this.removeFromWaitingList([this.client]);

            if (!room) return responseHandler([], 'left-chat');

            // Removes the room inside of the current open rooms of the client
            rooms.splice(
                rooms.findIndex((userRoom) => userRoom === room),
                1,
            );

            // Removes the client from the room in the server rooms
            this.server.rooms[room].splice(
                this.server.rooms[room].findIndex(
                    ({ connection: { user } }) => userId === user.id,
                ),
                1,
            );

            return responseHandler(this.server.rooms[room], 'left-chat', {
                user: { kordy },
                room,
            });
        } catch (error) {
            return errorHandler([this.client], { error: error.message });
        }
    };

    handleDisconnect = async (): Promise<ActionResponse> => {
        try {
            const {
                connection: {
                    rooms,
                    user: { id: userId, kordy },
                },
            } = this.client;

            // Checks if the user is inside the waiting room and remove him
            this.removeFromWaitingList([this.client]);

            // Removes the client from all the rooms he was in
            rooms.forEach((room) => {
                this.server.rooms[room].splice(
                    this.server.rooms[room].findIndex(
                        ({ connection: { user } }) => user.id === userId,
                    ),
                    1,
                );

                // Sends a response to all the clients who were inside of the same room
                const { clients, response } = responseHandler(
                    this.server.rooms[room],
                    'disconnect',
                    { user: { kordy }, room },
                );

                this.broadcast(clients, response);
            });

            return errorHandler(
                [this.client],
                {
                    error: 'WebSocket connection closed.',
                },
                'disconnect',
            );
        } catch (error) {
            return errorHandler([this.client], { error: error.message });
        }
    };
}

const responseHandler = (
    clients: ClientInterface[],
    action: Action,
    data = null,
    error = null,
    status = true,
): { clients: ClientInterface[]; response: ResponseInterface } => ({
    clients,
    response: { status, action, data, error },
});

const errorHandler = (
    clients: ClientInterface[],
    error = null,
    action: Action = 'error',
) => responseHandler(clients, action, null, error, false);
