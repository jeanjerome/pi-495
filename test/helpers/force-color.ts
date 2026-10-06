/**
 * Makes chalk, through which Pi's theme draws inverse video and the other modifiers, emit them when
 * the output is not a terminal, as under Preflight or in a pipe. Chalk reads FORCE_COLOR once, when
 * it loads: a test imports this module before anything that loads Pi.
 */
process.env.FORCE_COLOR = "1";
