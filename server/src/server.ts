import express, { Application, NextFunction, Request, Response } from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import { Profile, Strategy } from "passport-discord";
import { getFilesWithKeyword } from "./utils";
import passport from "passport";
import session from "express-session";
import { RouteGroup } from "./interface";
import { Config } from "./interface/Config";
import { Connection, createConnection } from "typeorm";
import EventEmitter from "events";
import banner from "./assets/banner.json";

export class Server extends EventEmitter {
  public app: Application;
  public orm?: Connection;

  constructor(public readonly config: Config) {
    super();
    this.app = express();
    this.init();
  }

  private init() {
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((obj: any, done) => done(null, obj));
    passport.use(
      new Strategy(
        this.config.discord.strategyOptions,
        (accessToken: string, refreshToken: string, profile: Profile, done) =>
          process.nextTick(() => done(null, profile))
      )
    );
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.server = this;
      next();
    });
    this.app.use(session(this.config.session));
    this.app.use(passport.initialize());
    this.app.use(passport.session());
    this.app.set("json spaces", 4);
    this.app.use(express.json());

    this.app.use(express.urlencoded({ extended: true }));
    if (this.config.server.environment === "development") {
      this.app.use(morgan("dev"));
      this.app.use(cors());
    } else if (this.config.server.environment === "production") {
      this.app.use(helmet());
    }
    this.app.use(
      [/(.*)\.(js|ts)$/, "/assets"],
      express.static(__dirname + "/assets")
    );
    getFilesWithKeyword("router", __dirname + "/routes").forEach(
      (file: string) => {
        const { route, router }: RouteGroup = new (require(file).default)(
          Server
        );
        this.app.use(route, router);
      }
    );
    this.app.use(
      (err: Error, req: Request, res: Response, _next: NextFunction) => {
        return res.status(500).json({
          error: err.name,
          message: err.message,
        });
      }
    );
    this.on("ready", async () => {
      console.clear();
      console.log(`\n${banner.join("\n")}\n`);
      console.log(`Port       :: ${this.config.server.port}`);
      console.log(`Database   :: ${this.config.orm.type}`);
      console.log(`Evironment :: ${this.config.server.environment}`);
    });
  }

  async start() {
    this.orm = await createConnection(this.config.orm);
    this.app.listen(
      this.config.server.port || 8080,
      this.config.server.hostname,
      () => this.emit("ready")
    );
  }
}

export default Server;
