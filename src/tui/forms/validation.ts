import { z } from "zod";

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

const PROTOCOLS = ["tcp", "udp", "sctp", "icmp", "none", "http", "https", "quic"] as const;

const ipv4 = z.string().regex(IPV4_REGEX, "Invalid IPv4 address");

const lbEndpointSchema = z.object({
  endpointIP: ipv4,
  targetPort: z.coerce.number().int().min(1).max(65535),
  weight: z.coerce.number().int().min(0).max(65535).default(1),
});

export const lbServiceFormSchema = z.object({
  externalIP: ipv4,
  port: z.coerce.number().int().min(1, "Port must be 1-65535").max(65535, "Port must be 1-65535"),
  protocol: z.enum(PROTOCOLS),
  sel: z.coerce.number().int().min(0).max(10).default(0),
  mode: z.coerce.number().int().min(0).max(6).default(0),
  name: z.string().default(""),
  monitor: z.boolean().default(false),
  bgp: z.boolean().default(false),
  snat: z.boolean().default(false),
  model_name: z.string().optional(),
  sse_mode: z.boolean().optional(),
  endpoints: z.array(lbEndpointSchema).min(1, "At least one endpoint required"),
});

export type LbServiceFormData = z.infer<typeof lbServiceFormSchema>;

export const routeFormSchema = z.object({
  destinationIPNet: z.string().regex(CIDR_REGEX, "Invalid CIDR (e.g. 10.0.0.0/24)"),
  gateway: z.string().regex(IPV4_REGEX, "Invalid gateway IP").optional().or(z.literal("")),
  protocol: z.coerce.number().int().min(0).optional(),
});

export type RouteFormData = z.infer<typeof routeFormSchema>;
