package registry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class UserRegistryTest {

    private InMemoryUserRepository repository;
    private UserRegistry registry;

    @BeforeEach
    void setUp() {
        repository = new InMemoryUserRepository();
        registry = new UserRegistry(repository);
    }

    @Test
    void create_savesANewUser() {
        User created = registry.create(new User(1L, "Ada"));

        assertEquals(new User(1L, "Ada"), created);
        assertEquals(List.of(created), registry.findAll());
    }

    @Test
    void create_refusesAnIdAlreadyHeld() {
        registry.create(new User(1L, "Ada"));

        assertThrows(RuleViolationException.class, () -> registry.create(new User(1L, "Grace")));
    }

    @Test
    void create_refusesANameAlreadyTaken() {
        registry.create(new User(1L, "Ada"));

        assertThrows(RuleViolationException.class, () -> registry.create(new User(2L, "Ada")));
        assertEquals(1, registry.findAll().size());
    }

    @Test
    void find_returnsTheUserOfThatId() {
        registry.create(new User(1L, "Ada"));

        assertEquals("Ada", registry.find(1L).name());
    }

    @Test
    void find_refusesAnUnknownId() {
        assertThrows(UserNotFoundException.class, () -> registry.find(9L));
    }

    @Test
    void update_replacesTheUserOfThatId() {
        registry.create(new User(1L, "Ada"));

        registry.update(1L, new User(1L, "Ada Lovelace"));

        assertEquals("Ada Lovelace", registry.find(1L).name());
    }

    @Test
    void update_refusesAnUnknownId() {
        assertThrows(UserNotFoundException.class, () -> registry.update(9L, new User(9L, "Ada")));
    }

    @Test
    void delete_removesTheUser() {
        registry.create(new User(1L, "Ada"));

        registry.delete(1L);

        assertTrue(registry.findAll().isEmpty());
    }

    @Test
    void delete_refusesAnUnknownId() {
        assertThrows(UserNotFoundException.class, () -> registry.delete(9L));
    }
}
