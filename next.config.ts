import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
const allowedDevOrigins = Object.values(networkInterfaces()).flatMap((addresses) =>
  (addresses ?? []).filter(({ family }) => family === "IPv4").map(({ address }) => address),
);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: "standalone",
};

export default withNextIntl(nextConfig);
