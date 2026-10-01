package registry;

/** Raised when an operation would break a rule of the registry. */
public class RuleViolationException extends RuntimeException {

    public RuleViolationException(String message) {
        super(message);
    }
}
