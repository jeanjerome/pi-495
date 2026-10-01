package registry;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** A fake repository that keeps users in memory, in insertion order. */
class InMemoryUserRepository implements UserRepository {

    private final Map<Long, User> users = new LinkedHashMap<>();

    @Override
    public Optional<User> findById(long id) {
        return Optional.ofNullable(users.get(id));
    }

    @Override
    public List<User> findAll() {
        return new ArrayList<>(users.values());
    }

    @Override
    public User save(User user) {
        users.put(user.id(), user);
        return user;
    }

    @Override
    public void delete(long id) {
        users.remove(id);
    }
}
