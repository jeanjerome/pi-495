package registry;

/** Raised when an operation names a user the registry does not hold. */
public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException(long id) {
        super("User not found with id: " + id);
    }
}
