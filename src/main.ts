import "./style.css";
import { start } from "./app";
import { keepUpToDate } from "./updates";

start();

if (import.meta.env.PROD) keepUpToDate();
