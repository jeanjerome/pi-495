/**
 * The reactor of `domain`, `infrastructure` and `app` where a class of `domain` loads `io.demo.infra.UserStore` by
 * `Class.forName` and a file of its resources names the same class, and the one where only names the map permits or
 * does not judge are written: a file of `app`, a comment of `domain`, a test source of `domain` and a binary file.
 */
import { DEPENDENCIES_REACTOR } from "./dependencies-reactor.ts";

export const USER_LOADER = "domain/src/main/java/io/demo/domain/port/UserLoader.java";
export const REPOSITORY_PROPERTIES = "domain/src/main/resources/repository.properties";
const BEANS_XML = "app/src/main/resources/beans.xml";
const USER = "domain/src/main/java/io/demo/domain/User.java";

/** The reactor where nothing but the map's own relations, comments, tests and binary files name a class of another part. */
export const PERMITTED_LINKS_REACTOR: Record<string, string> = {
	...DEPENDENCIES_REACTOR,
	[BEANS_XML]:
		'<?xml version="1.0" encoding="UTF-8"?>\n<beans>\n  <bean id="store" class="io.demo.infra.UserStore"/>\n</beans>\n',
	[USER]:
		"package io.demo.domain;\n\n/** Stored by io.demo.infra.UserStore, which the domain never names in its code. */\npublic class User {\n    // loaded by io.demo.infra.UserStore\n}\n",
	"domain/src/test/java/io/demo/domain/port/UserStoreLookupTest.java":
		'package io.demo.domain.port;\n\nclass UserStoreLookupTest {\n    Class<?> store() throws ClassNotFoundException {\n        return Class.forName("io.demo.infra.UserStore");\n    }\n}\n',
	"domain/src/main/resources/store.bin": "\u0000\u0001io.demo.infra.UserStore\u0000",
};

/** The reactor of the story, where `domain` reaches `infrastructure` by reflection and by configuration. */
export const CONFIGURED_LINKS_REACTOR: Record<string, string> = {
	...PERMITTED_LINKS_REACTOR,
	[USER_LOADER]:
		'package io.demo.domain.port;\n\npublic final class UserLoader {\n    public UserRepository repository() throws ReflectiveOperationException {\n        Class<?> store = Class.forName("io.demo.infra.UserStore");\n        return (UserRepository) store.getDeclaredConstructor().newInstance();\n    }\n}\n',
	[REPOSITORY_PROPERTIES]: "# the store the domain loads\nrepository.store=io.demo.infra.UserStore\n",
};

/** The line of `path` in the reactor of the story that holds `text`, counted from 1. */
export const linkLineOf = (path: string, text: string) =>
	CONFIGURED_LINKS_REACTOR[path]!.split("\n").findIndex((l) => l.includes(text)) + 1;
