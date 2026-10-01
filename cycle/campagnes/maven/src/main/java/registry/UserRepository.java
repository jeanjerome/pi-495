package registry;

import java.util.List;
import java.util.Optional;

/** Where the registry keeps its users. */
public interface UserRepository {

    Optional<User> findById(long id);

    List<User> findAll();

    User save(User user);

    void delete(long id);
}
