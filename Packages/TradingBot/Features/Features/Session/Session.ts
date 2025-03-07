import {ISession} from "@shared/Types/Interfaces/general.ts";
import {GeneralStore} from "@shared/Types/Interfaces/generalStore.ts";
import moment from "moment-timezone";
import {CircularBuffer} from "@tradingBot/Features/Core/CircularBuffer.ts";
import {Session as DBSession} from "@prisma/client";

export default class Session {
    public sessions: CircularBuffer<ISession>;
    public sessionRecords: DBSession[] = [];
    private readonly generalStore: GeneralStore;
    private indexMap: Map<number, number> = new Map();
    private maxId: number = 0;

    // capacity = 1500 means more than 1 year
    constructor(generalStoreInstance: GeneralStore, capacity: number = 100) {
        this.generalStore = generalStoreInstance;
        this.sessions = new CircularBuffer<ISession>(capacity);
    }

    /**
     * Fetch initial session records from and save in local.
     * @returns new fetched sessions
     */
    async fetch(): Promise<DBSession[] | void> {
        const generalStore = this.generalStore;
        const prisma = generalStore.state.Prisma;
        if (!prisma) return;

        this.sessionRecords = await prisma.session.findMany();

        return this.sessionRecords;
    }

    isUnixInSessionRecords(unix: number): DBSession | undefined {
        const dateTime = moment.unix(unix).utc(); // Interpret `unix` timestamp in UTC

        return this.sessionRecords.find((session) => {
            // Parse session start and end times relative to `unix`'s day
            const sessionStart = moment
                .utc(unix * 1000)
                .set("hour", parseInt(session.start.split(":")[0]))
                .set("minute", parseInt(session.start.split(":")[1]))
                .set("second", 0);

            const sessionEnd = moment
                .utc(unix * 1000)
                .set("hour", parseInt(session.end.split(":")[0]))
                .set("minute", parseInt(session.end.split(":")[1]))
                .set("second", 0);

            if (sessionStart.isBefore(sessionEnd)) {
                // Normal range: start < end
                return dateTime.isBetween(sessionStart, sessionEnd, null, "[]");
            } else {
                // Cross-midnight range: end is on the next day
                const midnight = moment.unix(unix).utc().startOf("day").add(1, "day");
                return (
                    dateTime.isBetween(sessionStart, midnight, null, "[)") ||
                    dateTime.isBetween(
                        midnight.subtract(1, "day"),
                        sessionEnd,
                        null,
                        "[)"
                    )
                );
            }
        });
    }

    handleSessionForFlow(unix: number): ISession | undefined {
        const sessionRecord = this.isUnixInSessionRecords(unix);
        if (!sessionRecord) return this.sessions.getNewest();

        const start = moment.utc(unix * 1000);
        start.set("hour", +sessionRecord.start.split(":")[0]);
        start.set("minute", +sessionRecord.start.split(":")[1]);

        const end = moment.utc(unix * 1000);
        end.set("hour", +sessionRecord.end.split(":")[0]);
        end.set("minute", +sessionRecord.end.split(":")[1]);

        // if the session is already exists, do not create a new one
        const sessionExists = this.generalStore.state.Session.isExists(
            start.unix(),
            end.unix()
        );
        if (sessionExists) return sessionExists;

        const data = {
            id: ++this.maxId,
            start: {
                unix: start.unix(),
                utc: start,
            },
            end: {
                unix: end.unix(),
                utc: end,
            },
            sessionId: sessionRecord.id,
        };
        this.sessions.add(data);

        // Remove old entries from the indexMap
        if (this.sessions.getSize() > this.sessions.getCapacity()) {
            const overwrittenItem = this.sessions.getOldest();
            if (overwrittenItem) this.indexMap.delete(overwrittenItem.id);
        }
        this.indexMap.set(data.id, this.sessions.getSize() - 1);

        return this.sessions.getNewest();
    }

    /**
     * Get the session have the specified start and end Unix timestamp range.
     * @param start - Start Unix timestamp.
     * @param end - End Unix timestamp.
     * @returns Wession within the range.
     */
    isExists(start: number, end: number): ISession | undefined {
        return this.sessions
            .getAll()
            .find((s) => s.start.unix === start && s.end.unix === end);
    }

    getSession(id: number): ISession | null {
        const index = this.getIndexById(id);
        return index !== undefined ? this.sessions.get(index) : null;
    }

    getMaxId(): number {
        return this.maxId;
    }

    getIndexById(id: number): number | undefined {
        return this.indexMap.get(id);
    }
}
