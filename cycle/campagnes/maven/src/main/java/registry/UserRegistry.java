package registry;

import java.util.List;

/** The registry's rules over the users its repository holds. */
public class UserRegistry {

    private final UserRepository repository;

    public UserRegistry(UserRepository repository) {
        this.repository = repository;
    }

    public User create(User user) {
        repository.findById(user.id()).ifPresent(existing -> {
            throw new RuleViolationException("User already exists.");
        });
        boolean nameTaken = repository.findAll().stream().anyMatch(existing -> existing.name().equals(user.name()));
        if (nameTaken) {
            throw new RuleViolationException("A user with name '" + user.name() + "' already exists.");
        }
        return repository.save(user);
    }

    public User find(long id) {
        return repository.findById(id).orElseThrow(() -> new UserNotFoundException(id));
    }

    public List<User> findAll() {
        return repository.findAll();
    }

    public User update(long id, User updated) {
        find(id);
        return repository.save(updated);
    }

    public void delete(long id) {
        find(id);
        repository.delete(id);
    }
}
