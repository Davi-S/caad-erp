def test_module_entrypoint_raises_system_exit_with_main_result() -> None:
    """
    GIVEN cli __main__ module execution context
    WHEN module is executed as a script
    THEN SystemExit is raised with parser.main return code
    """
    import io
    import runpy
    import sys

    # Arrange
    original_argv = sys.argv
    original_stdin = sys.stdin
    sys.argv = ["caad-erp-cli", "--config", "/definitely/missing/config.ini"]
    sys.stdin = io.StringIO("exit\n")

    # Act / Assert
    try:
        with __import__("pytest").raises(SystemExit) as exc_info:
            runpy.run_module("caad_erp.cli.__main__", run_name="__main__")
        assert exc_info.value.code == 3
    finally:
        sys.argv = original_argv
        sys.stdin = original_stdin
