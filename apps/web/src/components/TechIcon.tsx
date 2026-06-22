import nodejsSvg from "simple-icons/icons/nodedotjs.svg?raw";
import goSvg from "simple-icons/icons/go.svg?raw";
import pythonSvg from "simple-icons/icons/python.svg?raw";
import javaSvg from "simple-icons/icons/openjdk.svg?raw";
import rustSvg from "simple-icons/icons/rust.svg?raw";
import dotnetSvg from "simple-icons/icons/dotnet.svg?raw";
import elixirSvg from "simple-icons/icons/elixir.svg?raw";
import reactSvg from "simple-icons/icons/react.svg?raw";
import vueSvg from "simple-icons/icons/vuedotjs.svg?raw";
import angularSvg from "simple-icons/icons/angular.svg?raw";
import nextjsSvg from "simple-icons/icons/nextdotjs.svg?raw";
import svelteSvg from "simple-icons/icons/svelte.svg?raw";
import remixSvg from "simple-icons/icons/remix.svg?raw";
import astroSvg from "simple-icons/icons/astro.svg?raw";
import postgresqlSvg from "simple-icons/icons/postgresql.svg?raw";
import mongodbSvg from "simple-icons/icons/mongodb.svg?raw";
import redisSvg from "simple-icons/icons/redis.svg?raw";
import mysqlSvg from "simple-icons/icons/mysql.svg?raw";
import clickhouseSvg from "simple-icons/icons/clickhouse.svg?raw";
import neo4jSvg from "simple-icons/icons/neo4j.svg?raw";
import terraformSvg from "simple-icons/icons/terraform.svg?raw";
import dockerSvg from "simple-icons/icons/docker.svg?raw";
import kubernetesSvg from "simple-icons/icons/kubernetes.svg?raw";
import flutterSvg from "simple-icons/icons/flutter.svg?raw";
import githubSvg from "simple-icons/icons/github.svg?raw";

const icons: Record<string, string> = {
  nodejs: nodejsSvg,
  go: goSvg,
  python: pythonSvg,
  java: javaSvg,
  rust: rustSvg,
  dotnet: dotnetSvg,
  elixir: elixirSvg,
  react: reactSvg,
  vue: vueSvg,
  angular: angularSvg,
  nextjs: nextjsSvg,
  svelte: svelteSvg,
  remix: remixSvg,
  astro: astroSvg,
  postgresql: postgresqlSvg,
  mongodb: mongodbSvg,
  redis: redisSvg,
  mysql: mysqlSvg,
  clickhouse: clickhouseSvg,
  neo4j: neo4jSvg,
  terraform: terraformSvg,
  docker: dockerSvg,
  kubernetes: kubernetesSvg,
  "react-native": reactSvg,
  flutter: flutterSvg,
  custom: githubSvg,
};

interface TechIconProps {
  icon: string;
  className?: string;
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<svg[^>]*>/, (m) => m.replace(/fill="[^"]*"/g, ""))
    .replace(/fill="#[^"]*"/gi, 'fill="currentColor"')
    .replace(/<svg /, '<svg fill="currentColor" ');
}

export function TechIcon({ icon, className = "w-5 h-5" }: TechIconProps) {
  const raw = icons[icon];
  if (!raw) return null;
  return (
    <span
      className={`inline-block ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(raw) }}
    />
  );
}
