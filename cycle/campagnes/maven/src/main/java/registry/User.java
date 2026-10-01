package registry;

/** A registered user; the name is what a person reads, the id is what the registry keys on. */
public record User(long id, String name) {
}
