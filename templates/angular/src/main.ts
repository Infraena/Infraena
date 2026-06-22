import { bootstrapApplication } from "@angular/platform-browser";
import { Component } from "@angular/core";
@Component({ selector: "app-root", template: "<h1>{{serviceName}}</h1>" })
export class App {}
bootstrapApplication(App);
